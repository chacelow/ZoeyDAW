//! One control-thread owner for device, decoded media, protocol fence and graph updates.
use crate::{
    assets::AudioSource,
    mix::Mixer,
    protocol::{BackendFailureCode, BackendRequest, BackendResult, BackendTelemetry, SessionFence},
    realtime::{Plan, Snapshot, TimelineNode},
    transport::{Transport, TransportClock},
};
use firewheel::{
    cpal::{CpalConfig, CpalStream},
    FirewheelConfig, FirewheelContext,
};
use std::{
    cell::RefCell,
    collections::BTreeMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use triple_buffer::{Input, TripleBuffer};

struct CachedSource {
    uri: String,
    audio: Arc<AudioSource>,
}
type SourceCache = BTreeMap<String, CachedSource>;

pub struct DeviceSession {
    context: FirewheelContext,
    stream: CpalStream,
    sender: Input<Option<Plan>>,
    fault: Arc<AtomicBool>,
    fence: SessionFence,
    sources: SourceCache,
    snapshot: Option<Arc<Snapshot>>,
    transport: Option<Transport>,
    track_ids: Vec<String>,
    telemetry_sequence: u64,
}

pub fn rejected(request: &BackendRequest, code: BackendFailureCode) -> BackendResult {
    BackendResult::Rejected {
        session_id: request.session_id.clone(),
        sequence: request.sequence,
        code,
    }
}

impl DeviceSession {
    pub fn open() -> Result<Self, String> {
        let (sender, receiver) = TripleBuffer::new(&None::<Plan>).split();
        let fault = Arc::new(AtomicBool::new(false));
        let mut context = FirewheelContext::new(FirewheelConfig {
            initial_node_capacity: 4,
            initial_edge_capacity: 4,
            initial_event_group_capacity: 8,
            immediate_event_capacity: 8,
            ..Default::default()
        });
        let id = context
            .add_node(
                TimelineNode {
                    receiver: RefCell::new(Some(receiver)),
                    fault: fault.clone(),
                },
                None,
            )
            .map_err(|e| e.to_string())?;
        context
            .connect(id, context.graph_out_node_id(), &[(0, 0), (1, 1)], false)
            .map_err(|e| e.to_string())?;
        let mut config = CpalConfig::default();
        config.output.desired_sample_rate = Some(48000);
        config.output.desired_block_frames = Some(256);
        let stream = CpalStream::new(&mut context, config).map_err(|e| e.to_string())?;
        context.update().map_err(|e| e.to_string())?;
        Ok(Self {
            context,
            stream,
            sender,
            fault,
            fence: SessionFence::new(),
            sources: BTreeMap::new(),
            snapshot: None,
            transport: None,
            track_ids: Vec::new(),
            telemetry_sequence: 0,
        })
    }

    pub fn sample_rate(&self) -> u32 {
        self.stream.info().sample_rate.get()
    }

    fn healthy(&mut self) -> bool {
        let failed = self.context.update().is_err()
            || self.stream.poll_status().next().is_some()
            || !self.stream.output_stream_ok();
        if failed {
            self.fault.store(true, Ordering::Release);
        }
        !self.fault.load(Ordering::Acquire)
    }

    pub fn apply(&mut self, request: &BackendRequest) -> BackendResult {
        if let Err(code) = self.fence.validate(request) {
            return rejected(request, code);
        }
        if !self.healthy() {
            return rejected(request, BackendFailureCode::Rejected);
        }
        match self.prepare(request) {
            Ok((plan, sources)) => {
                self.snapshot = Some(plan.snapshot.clone());
                self.transport = Some(plan.transport.clone());
                self.track_ids = request
                    .state
                    .project
                    .tracks
                    .iter()
                    .map(|t| t.id.clone())
                    .collect();
                self.sources = sources;
                self.sender.write(Some(plan));
                self.fence.apply(request)
            }
            Err(_) => rejected(request, BackendFailureCode::Rejected),
        }
    }

    fn prepare(&self, request: &BackendRequest) -> Result<(Plan, SourceCache), String> {
        let project = &request.state.project;
        let bars_per_second =
            project.bpm / 60.0 * project.denominator as f64 / (4.0 * project.numerator as f64);
        let clock = TransportClock::new(self.sample_rate(), bars_per_second)
            .ok_or("invalid tempo or meter")?;
        if project.numerator == 0
            || project.denominator == 0
            || !request.state.control.seek_bar.is_finite()
            || request.state.control.seek_bar < 1.0
        {
            return Err("invalid musical coordinates".into());
        }
        if project.loop_region.enabled
            && (!project.loop_region.start_bar.is_finite()
                || !project.loop_region.end_bar.is_finite()
                || project.loop_region.start_bar < 1.0
                || project.loop_region.end_bar <= project.loop_region.start_bar)
        {
            return Err("invalid loop".into());
        }
        let mut sources = BTreeMap::new();
        let mut pcm = BTreeMap::new();
        for source in &project.sources {
            if sources.contains_key(&source.id) {
                return Err("duplicate source id".into());
            }
            let decoded = if let Some(cached) = self
                .sources
                .get(&source.id)
                .filter(|cached| cached.uri == source.uri)
            {
                cached.audio.clone()
            } else {
                Arc::new(AudioSource::decode(
                    &local_path(&source.uri)?,
                    self.sample_rate(),
                )?)
            };
            pcm.insert(source.id.clone(), decoded.clone());
            sources.insert(
                source.id.clone(),
                CachedSource {
                    uri: source.uri.clone(),
                    audio: decoded,
                },
            );
        }
        let mixer = Mixer::compile(project, clock, &pcm)?;
        let snapshot = Arc::new(Snapshot::new(project.tracks.len()));
        Ok((
            Plan {
                mixer,
                transport: Transport::from_control(clock, project, &request.state.control),
                seek_generation: request.state.control.seek_generation,
                snapshot,
            },
            sources,
        ))
    }

    pub fn telemetry(&mut self) -> Option<BackendTelemetry> {
        if !self.healthy() {
            return None;
        }
        let state = self.fence.state()?;
        let transport = self.transport.as_ref()?;
        let template = BackendTelemetry {
            session_id: self.fence.session_id()?.into(),
            sequence: self.telemetry_sequence,
            applied_sequence: self.fence.last_sequence()?,
            clock: transport.to_backend_clock(),
            playing: state.control.playing,
            recording: state.control.recording,
            levels: BTreeMap::new(),
            output_latency_frames: None,
        };
        let frame = self
            .snapshot
            .as_ref()?
            .telemetry(template, transport, &self.track_ids)?;
        self.telemetry_sequence += 1;
        Some(frame)
    }

    pub fn read_peaks(
        &self,
        source: &str,
        start: u64,
        end: u64,
        pixels: usize,
    ) -> Result<Vec<f32>, String> {
        self.sources
            .get(source)
            .ok_or("unknown source")?
            .audio
            .read_peaks(start, end, pixels)
            .map_err(str::to_owned)
    }
}

fn local_path(uri: &str) -> Result<PathBuf, String> {
    if !uri.starts_with("file:") {
        if uri.contains("://") {
            return Err("only local file sources are supported".into());
        }
        return Ok(PathBuf::from(uri));
    }
    let path = uri
        .strip_prefix("file://localhost/")
        .map(|rest| format!("/{rest}"))
        .or_else(|| uri.strip_prefix("file:///").map(|rest| format!("/{rest}")))
        .ok_or("invalid local file URI")?;
    let mut decoded = Vec::with_capacity(path.len());
    let mut bytes = path.bytes();
    while let Some(byte) = bytes.next() {
        decoded.push(if byte == b'%' {
            let high = char::from(bytes.next().ok_or("truncated URI escape")?)
                .to_digit(16)
                .ok_or("invalid URI escape")?;
            let low = char::from(bytes.next().ok_or("truncated URI escape")?)
                .to_digit(16)
                .ok_or("invalid URI escape")?;
            (high * 16 + low) as u8
        } else {
            byte
        });
    }
    String::from_utf8(decoded)
        .map(PathBuf::from)
        .map_err(|e| e.to_string())
}
