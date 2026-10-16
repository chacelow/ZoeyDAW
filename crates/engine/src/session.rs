//! One control-thread owner for device, decoded media, protocol fence and graph updates.
use crate::{
    assets::{AudioSource, MAX_PEAK_PIXELS},
    mix::Mixer,
    protocol::{BackendFailureCode, BackendRequest, BackendResult, BackendTelemetry, SessionFence},
    realtime::{Plan, Snapshot, TimelineNode},
    transport::{bar_to_frame, source_offset_frame, Transport, TransportClock},
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

    pub fn source_info(&self, source: &str) -> Option<crate::assets::SourceInfo> {
        self.sources
            .get(source)
            .map(|cached| cached.audio.source_info)
    }

    /// Clip-local one-based bars to source frames on the project tempo at the
    /// decoded source rate; `content_offset_bars` wraps exactly like playback.
    /// Stereo channel-major `[min,max]` pixels. Unknown sources, empty or
    /// non-finite ranges read as silence; invalid pixel counts as empty.
    pub fn read_peaks_at_bars(
        &self,
        source: &str,
        start_bar: f64,
        end_bar: f64,
        pixels: usize,
        content_offset_bars: f64,
    ) -> Vec<f32> {
        if pixels == 0 || pixels > MAX_PEAK_PIXELS {
            return Vec::new();
        }
        let peaks = (|| {
            let audio = &self.sources.get(source)?.audio;
            let tempo = self.transport.as_ref()?.clock;
            let clock = TransportClock::new(audio.source_info.sample_rate, tempo.bars_per_second)?;
            if !start_bar.is_finite() || !end_bar.is_finite() || !content_offset_bars.is_finite() {
                return None;
            }
            let frames = audio.source_info.frames;
            let start = bar_to_frame(clock, start_bar);
            let span = bar_to_frame(clock, end_bar).checked_sub(start)?;
            let offset = source_offset_frame(clock, content_offset_bars, frames)?;
            audio
                .read_looped_peaks(start % frames + offset, span, pixels)
                .ok()
        })();
        peaks.unwrap_or_else(|| vec![0.0; pixels * 4])
    }
}

fn local_path(uri: &str) -> Result<PathBuf, String> {
    if !uri.starts_with("file:") {
        if uri.contains("://") {
            return Err("only local file sources are supported".into());
        }
        return Ok(PathBuf::from(uri));
    }
    // URL parsing deliberately tolerates malformed percent escapes; our source
    // contract does not. Validate them before delegating OS path conversion.
    let bytes = uri.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let escape = bytes
                .get(index + 1..index + 3)
                .ok_or("truncated URI escape")?;
            if !escape.iter().all(u8::is_ascii_hexdigit) {
                return Err("invalid URI escape".into());
            }
            index += 3;
        } else {
            index += 1;
        }
    }
    let path = url::Url::parse(uri)
        .map_err(|error| error.to_string())?
        .to_file_path()
        .map_err(|_| "invalid local file URI")?;
    #[cfg(not(windows))]
    if path.to_str().is_none() {
        return Err("local file URI is not valid UTF-8".into());
    }
    Ok(path)
}

#[cfg(test)]
mod path_tests {
    use super::local_path;
    use std::path::PathBuf;

    #[test]
    fn local_paths_are_not_treated_as_urls() {
        for path in [
            "audio/clip.wav",
            "C:\\Audio\\clip.wav",
            "//server/share/clip.wav",
        ] {
            assert_eq!(local_path(path).unwrap(), PathBuf::from(path));
        }
        assert!(local_path("https://example.com/clip.wav").is_err());
    }

    #[test]
    fn malformed_percent_escapes_remain_errors() {
        for uri in [
            "file:///audio/clip%",
            "file:///audio/clip%2",
            "file:///audio/clip%GG",
        ] {
            assert!(local_path(uri).is_err(), "accepted {uri}");
        }
    }

    #[cfg(not(windows))]
    #[test]
    fn unix_file_uris_decode_escaped_local_paths() {
        assert_eq!(
            local_path("file:///audio/piano%20%E4%B8%AD%23.wav").unwrap(),
            PathBuf::from("/audio/piano 中#.wav")
        );
        assert_eq!(
            local_path("file://localhost/audio/clip.wav").unwrap(),
            PathBuf::from("/audio/clip.wav")
        );
        assert!(local_path("file://server/share/clip.wav").is_err());
        assert!(local_path("file:///tmp/clip%FF.wav").is_err());
    }

    #[cfg(windows)]
    #[test]
    fn windows_file_uris_resolve_drive_unc_and_escapes() {
        assert_eq!(
            local_path("file:///C:/Audio/clip.wav").unwrap(),
            PathBuf::from("C:\\Audio\\clip.wav")
        );
        assert_eq!(
            local_path("file:///C:/Audio/piano%20%E4%B8%AD%23.wav").unwrap(),
            PathBuf::from("C:\\Audio\\piano 中#.wav")
        );
        assert_eq!(
            local_path("file://localhost/C:/Audio/clip.wav").unwrap(),
            PathBuf::from("C:\\Audio\\clip.wav")
        );
        assert_eq!(
            local_path("file://server/share/clip%20one.wav").unwrap(),
            PathBuf::from("\\\\server\\share\\clip one.wav")
        );
        assert!(local_path("file:///Audio/clip.wav").is_err());
    }
}
