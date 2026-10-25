use super::{
    channel::MeterChannel,
    metadata_generated::{EndpointResetBaseline, MeterResetBaseline, MeterResetKind},
    native_reader::{
        NativeInputRegistry, NativeMeterReader, NativeMeterRegistry, NativeTransportObservation,
    },
    protocol_generated::WireRecord,
};
use arc_swap::ArcSwapOption;
use futures_channel::oneshot;
use std::collections::VecDeque;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

#[derive(Clone, Copy, Debug)]
pub struct HubTransportObservation {
    pub audio: NativeTransportObservation,
    pub received_monotonic_ns: u64,
}

pub struct HubInputSnapshot {
    pub registry: Arc<NativeInputRegistry>,
    pub records: Vec<WireRecord>,
}

struct InstalledInput {
    registry: Arc<NativeInputRegistry>,
    reader: NativeMeterReader,
    channels: Vec<MeterChannel>,
}

pub struct HubSnapshot {
    pub sequence: u64,
    pub produced_monotonic_ns: u64,
    pub registry: Arc<NativeMeterRegistry>,
    pub records: Vec<WireRecord>,
    pub reset_epoch: u32,
    pub endpoint_resets: Arc<Vec<EndpointResetBaseline>>,
    pub transport: Option<HubTransportObservation>,
    pub input: Option<Arc<HubInputSnapshot>>,
}

impl HubSnapshot {
    pub fn realtime_registry(
        &self,
        session_epoch: u32,
        registry_revision: u32,
    ) -> Result<super::metadata_generated::RealtimeRegistry, String> {
        let mut entries = self.registry.entries.clone();
        let offset = u32::try_from(entries.len()).map_err(|_| "Meter slot capacity exceeded")?;
        if let Some(input) = self.input.as_ref() {
            for entry in &input.registry.entries {
                let mut entry = entry.clone();
                entry.slot_id = entry
                    .slot_id
                    .checked_add(offset)
                    .ok_or("Meter slot capacity exceeded")?;
                entries.push(entry);
            }
        }
        let mut endpoint_resets: Vec<EndpointResetBaseline> = Vec::new();
        for entry in &entries {
            let record = if entry.slot_id < offset {
                self.records.get(entry.slot_id as usize)
            } else {
                self.input
                    .as_ref()
                    .and_then(|input| input.records.get((entry.slot_id - offset) as usize))
            }
            .ok_or("Hub snapshot missing registered meter slot")?;
            if let Some(baseline) = endpoint_resets
                .iter_mut()
                .find(|baseline| baseline.endpoint_id == entry.endpoint_id)
            {
                if baseline.slot_reset_epoch != record.slot_reset_epoch {
                    return Err("Meter endpoint reset is incomplete".into());
                }
                baseline.slot_ids.push(entry.slot_id);
            } else {
                endpoint_resets.push(EndpointResetBaseline {
                    endpoint_id: entry.endpoint_id.clone(),
                    slot_ids: vec![entry.slot_id],
                    slot_reset_epoch: record.slot_reset_epoch,
                });
            }
        }
        Ok(super::metadata_generated::RealtimeRegistry {
            session_id: self.registry.session_id.clone(),
            session_epoch,
            device_epoch: self
                .input
                .as_ref()
                .map_or(self.registry.device_epoch, |input| {
                    input.registry.device_epoch
                }),
            generation: self.registry.generation,
            registry_revision,
            reset_epoch: self.reset_epoch,
            entries,
            sources: Vec::new(),
            endpoint_resets,
        })
    }

    pub fn select_records(&self, slots: &[u32]) -> Result<Vec<WireRecord>, String> {
        let offset =
            u32::try_from(self.records.len()).map_err(|_| "Meter slot capacity exceeded")?;
        let mut unique = std::collections::HashSet::with_capacity(slots.len());
        let mut selected = Vec::with_capacity(slots.len());
        for slot in slots {
            if !unique.insert(*slot) {
                return Err("Duplicate meter interest slot".into());
            }
            let value = if *slot < offset {
                self.records.get(*slot as usize)
            } else {
                self.input
                    .as_ref()
                    .and_then(|input| input.records.get((*slot - offset) as usize))
            }
            .ok_or("Unknown meter interest slot")?;
            let mut value = *value;
            value.slot_id = *slot;
            selected.push(value);
        }
        Ok(selected)
    }
}

struct InstalledGraph {
    registry: Arc<NativeMeterRegistry>,
    reader: NativeMeterReader,
    channels: Vec<MeterChannel>,
    reset: Option<PendingReset>,
    confirmed_reset_epoch: u32,
    endpoint_resets: Arc<Vec<EndpointResetBaseline>>,
    transport: Option<HubTransportObservation>,
}

struct ResetRequest {
    identity: super::native_reader::MeterGraphIdentity,
    input_epoch: Option<u32>,
    endpoints: Vec<String>,
    kind: MeterResetKind,
    reply: oneshot::Sender<Result<MeterResetBaseline, String>>,
}
struct PendingReset {
    slots: Vec<u32>,
    baseline: MeterResetBaseline,
    input_slots: Vec<u32>,
    input_epoch: Option<u32>,
    previous: Option<Arc<HubSnapshot>>,
    reply: oneshot::Sender<Result<MeterResetBaseline, String>>,
}

#[derive(Default)]
struct Control {
    pending: Option<InstalledGraph>,
    clear: bool,
    stop: bool,
    identity: Option<super::native_reader::MeterGraphIdentity>,
    session_id: Option<String>,
    resets: VecDeque<ResetRequest>,
    input_identity: Option<u32>,
    input_change: Option<Option<InstalledInput>>,
}
struct Shared {
    control: Mutex<Control>,
    wake: Condvar,
    snapshot_ready: Condvar,
    visible: AtomicBool,
    latest: ArcSwapOption<HubSnapshot>,
    error: Mutex<Option<String>>,
    origin: Instant,
}

/// The service owns one Hub. Neither this thread nor ArcSwap is used by audio callbacks.
pub struct MeterHub {
    shared: Arc<Shared>,
    worker: Option<JoinHandle<()>>,
}
impl MeterHub {
    pub fn start() -> Result<Self, String> {
        let shared = Arc::new(Shared {
            control: Mutex::new(Control::default()),
            wake: Condvar::new(),
            visible: AtomicBool::new(false),
            snapshot_ready: Condvar::new(),
            latest: ArcSwapOption::empty(),
            error: Mutex::new(None),
            origin: Instant::now(),
        });
        let state = shared.clone();
        let worker = thread::Builder::new()
            .name("zoeydaw-meter-hub".into())
            .spawn(move || run(state))
            .map_err(|error| error.to_string())?;
        Ok(Self {
            shared,
            worker: Some(worker),
        })
    }

    pub fn install(
        &self,
        registry: NativeMeterRegistry,
        reader: NativeMeterReader,
    ) -> Result<(), String> {
        registry.validate(&registry.session_id)?;
        if registry.identity() != reader.identity()
            || reader.slots().len() != registry.entries.len()
            || reader
                .slots()
                .iter()
                .enumerate()
                .any(|(index, slot)| *slot as usize != index)
        {
            return Err("Hub reader does not cover its complete registry".into());
        }
        let channels = registry
            .entries
            .iter()
            .map(|_| MeterChannel::new(registry.sample_rate.get()).ok_or("Invalid Hub sample rate"))
            .collect::<Result<Vec<_>, _>>()?;
        let mut endpoint_resets: Vec<EndpointResetBaseline> = Vec::new();
        for entry in &registry.entries {
            if let Some(baseline) = endpoint_resets
                .iter_mut()
                .find(|baseline| baseline.endpoint_id == entry.endpoint_id)
            {
                baseline.slot_ids.push(entry.slot_id);
            } else {
                endpoint_resets.push(EndpointResetBaseline {
                    endpoint_id: entry.endpoint_id.clone(),
                    slot_ids: vec![entry.slot_id],
                    slot_reset_epoch: 0,
                });
            }
        }
        let graph = InstalledGraph {
            registry: Arc::new(registry),
            reader,
            channels,
            reset: None,
            confirmed_reset_epoch: 0,
            endpoint_resets: Arc::new(endpoint_resets),
            transport: None,
        };
        let mut control = self
            .shared
            .control
            .lock()
            .map_err(|_| "Meter Hub control lock poisoned")?;
        control.identity = Some(graph.registry.identity());
        control.session_id = Some(graph.registry.session_id.clone());
        control.pending = Some(graph);
        control.clear = true;
        self.shared.latest.store(None);
        if let Ok(mut error) = self.shared.error.lock() {
            *error = None;
        }
        self.shared.wake.notify_one();
        self.shared.snapshot_ready.notify_all();
        Ok(())
    }

    pub fn input_epoch(&self) -> Option<u32> {
        self.shared
            .control
            .lock()
            .ok()
            .and_then(|control| control.input_identity)
    }
    pub fn install_input(
        &self,
        registry: NativeInputRegistry,
        reader: NativeMeterReader,
    ) -> Result<(), String> {
        registry.validate()?;
        if reader.identity().device_epoch != registry.device_epoch
            || reader.slots().len() != registry.entries.len()
        {
            return Err("Input reader does not cover its device registry".into());
        }
        let channels = registry
            .entries
            .iter()
            .map(|_| {
                MeterChannel::new(registry.sample_rate.get())
                    .ok_or("Invalid input meter sample rate")
            })
            .collect::<Result<Vec<_>, _>>()?;
        let mut control = self
            .shared
            .control
            .lock()
            .map_err(|_| "Meter Hub control lock poisoned")?;
        control.input_identity = Some(registry.device_epoch);
        control.input_change = Some(Some(InstalledInput {
            registry: Arc::new(registry),
            reader,
            channels,
        }));
        self.shared.latest.store(None);
        self.shared.wake.notify_one();
        Ok(())
    }
    pub fn clear_input(&self) -> Result<(), String> {
        let mut control = self
            .shared
            .control
            .lock()
            .map_err(|_| "Meter Hub control lock poisoned")?;
        control.input_identity = None;
        control.input_change = Some(None);
        self.shared.latest.store(None);
        self.shared.wake.notify_one();
        Ok(())
    }

    pub fn clear(&self) -> Result<(), String> {
        let mut control = self
            .shared
            .control
            .lock()
            .map_err(|_| "Meter Hub control lock poisoned")?;
        control.pending = None;
        control.identity = None;
        control.session_id = None;
        control.input_identity = None;
        control.input_change = Some(None);
        control.clear = true;
        self.shared.latest.store(None);
        if let Ok(mut error) = self.shared.error.lock() {
            *error = None;
        }
        self.shared.wake.notify_one();
        self.shared.snapshot_ready.notify_all();
        Ok(())
    }
    pub fn set_visible(&self, session_id: &str, visible: bool) -> Result<(), String> {
        let control = self
            .shared
            .control
            .lock()
            .map_err(|_| "Meter Hub control lock poisoned")?;
        if control.session_id.as_deref() != Some(session_id) {
            return Err("Meter Hub session changed".into());
        }
        self.shared.visible.store(visible, Ordering::Release);
        self.shared.wake.notify_one();
        Ok(())
    }
    pub fn snapshot(&self) -> Option<Arc<HubSnapshot>> {
        self.shared.latest.load_full()
    }
    pub fn wait_snapshot(
        &self,
        session_id: &str,
        timeout: Duration,
    ) -> Result<Arc<HubSnapshot>, String> {
        let deadline = Instant::now() + timeout;
        let mut control = self
            .shared
            .control
            .lock()
            .map_err(|_| "Meter Hub control lock poisoned")?;
        let identity = control.identity.ok_or("Meter Hub has no installed graph")?;
        loop {
            if control.stop
                || control.session_id.as_deref() != Some(session_id)
                || control.identity != Some(identity)
            {
                return Err("Meter Hub changed during stream admission".into());
            }
            if let Some(snapshot) = self.shared.latest.load_full() {
                if snapshot.registry.session_id == session_id
                    && snapshot.registry.identity() == identity
                {
                    return Ok(snapshot);
                }
            }
            if let Some(error) = self.error() {
                return Err(error);
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err("Meter Hub snapshot admission timed out".into());
            }
            let (next, _) = self
                .shared
                .snapshot_ready
                .wait_timeout(control, remaining)
                .map_err(|_| "Meter Hub control lock poisoned")?;
            control = next;
        }
    }

    pub(crate) fn finish_stream_admission(
        &self,
        streams: &mut super::streams::MeterStreams,
        admission: super::streams::StreamAdmission,
        expected: &HubSnapshot,
    ) -> Result<super::metadata_generated::RealtimeStreamOpenResult, String> {
        let control = self
            .shared
            .control
            .lock()
            .map_err(|_| "Meter Hub control lock poisoned")?;
        if control.stop
            || control.clear
            || control.input_change.is_some()
            || control.session_id.as_deref() != Some(expected.registry.session_id.as_str())
            || control.identity != Some(expected.registry.identity())
        {
            streams.cancel(&admission);
            return Err("Meter Hub changed during stream admission".into());
        }
        let Some(current) = self.shared.latest.load_full() else {
            streams.cancel(&admission);
            return Err("Meter Hub snapshot is not ready".into());
        };
        streams.finish(admission, &current)
    }
    pub fn error(&self) -> Option<String> {
        self.shared
            .error
            .lock()
            .ok()
            .and_then(|value| value.clone())
    }
    pub fn monotonic_ns(&self) -> Option<u64> {
        self.shared.origin.elapsed().as_nanos().try_into().ok()
    }
    pub fn identity(&self) -> Option<super::native_reader::MeterGraphIdentity> {
        self.shared
            .control
            .lock()
            .ok()
            .and_then(|control| control.identity)
    }
    pub fn session_id(&self) -> Option<String> {
        self.shared
            .control
            .lock()
            .ok()
            .and_then(|control| control.session_id.clone())
    }
    pub async fn reset(
        &self,
        session_id: &str,
        identity: super::native_reader::MeterGraphIdentity,
        endpoints: Vec<String>,
        kind: MeterResetKind,
    ) -> Result<MeterResetBaseline, String> {
        let (reply, receive) = oneshot::channel();
        {
            let mut control = self
                .shared
                .control
                .lock()
                .map_err(|_| "Meter Hub control lock poisoned")?;
            if control.identity != Some(identity)
                || control.session_id.as_deref() != Some(session_id)
            {
                return Err("Meter graph changed before reset".into());
            }
            if endpoints.is_empty() || endpoints.len() > 4096 {
                return Err("Invalid reset endpoint count".into());
            }
            if control.resets.len() >= 64 {
                return Err("Meter reset queue capacity reached".into());
            }
            let input_epoch = control.input_identity;
            control.resets.push_back(ResetRequest {
                identity,
                input_epoch,
                endpoints,
                kind,
                reply,
            });
            self.shared.wake.notify_one();
        }
        receive
            .await
            .map_err(|_| "Meter reset cancelled by graph retirement".to_owned())?
    }
}
impl Drop for MeterHub {
    fn drop(&mut self) {
        if let Ok(mut control) = self.shared.control.lock() {
            control.stop = true;
            self.shared.wake.notify_one();
            self.shared.snapshot_ready.notify_all();
        }
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
fn run(shared: Arc<Shared>) {
    let mut installed: Option<InstalledGraph> = None;
    let mut input: Option<InstalledInput> = None;
    let mut sequence = 0_u64;
    let mut reset_epoch = 0_u32;
    let mut confirmed_reset_epoch = 0_u32;
    loop {
        let mut control = match shared.control.lock() {
            Ok(value) => value,
            Err(_) => return,
        };
        if control.stop {
            return;
        }
        if let Some(change) = control.input_change.take() {
            input = change;
        }
        if control.clear {
            installed = control.pending.take();
            if let Some(graph) = installed.as_mut() {
                graph.confirmed_reset_epoch = confirmed_reset_epoch;
            }
            control.clear = false;
            shared.latest.store(None);
            let identity = installed.as_ref().map(|graph| graph.registry.identity());
            let requests = std::mem::take(&mut control.resets);
            for request in requests {
                if Some(request.identity) == identity {
                    control.resets.push_back(request);
                } else {
                    let _ = request
                        .reply
                        .send(Err("Meter graph changed before reset".into()));
                }
            }
        }
        if installed.is_none() {
            while !control.stop && !control.clear {
                control = match shared.wake.wait(control) {
                    Ok(value) => value,
                    Err(_) => return,
                };
            }
            continue;
        }
        let request = if installed
            .as_ref()
            .is_some_and(|graph| graph.reset.is_none())
        {
            control.resets.pop_front()
        } else {
            None
        };
        drop(control);
        let now = shared.origin.elapsed();
        if let Some(graph) = &mut installed {
            let result = (|| {
                let mut confirmation = None;
                if let Some(request) = request {
                    if !request.reply.is_canceled() {
                        match prepare_reset(
                            &graph.registry,
                            input.as_ref().map(|input| input.registry.as_ref()),
                            &request,
                            reset_epoch,
                        ) {
                            Ok((slots, input_slots, baseline)) => {
                                reset_epoch = baseline.reset_epoch;
                                let applied = (|| {
                                    if !slots.is_empty() {
                                        graph.reader.request_reset(
                                            &slots,
                                            baseline.reset_epoch,
                                            &request.kind,
                                        )?;
                                    }
                                    if !input_slots.is_empty() {
                                        input
                                            .as_mut()
                                            .ok_or("Input device changed before reset")?
                                            .reader
                                            .request_reset(
                                                &input_slots,
                                                baseline.reset_epoch,
                                                &request.kind,
                                            )?;
                                    }
                                    Ok::<(), String>(())
                                })();
                                if let Err(error) = applied {
                                    let _ = request.reply.send(Err(error));
                                } else {
                                    let input_epoch =
                                        input.as_ref().map(|value| value.registry.device_epoch);
                                    graph.reset = Some(PendingReset {
                                        slots,
                                        input_slots,
                                        input_epoch,
                                        baseline,
                                        previous: shared.latest.load_full(),
                                        reply: request.reply,
                                    });
                                }
                            }
                            Err(error) => {
                                let _ = request.reply.send(Err(error));
                            }
                        }
                    }
                }
                if graph.reset.as_ref().is_some_and(|reset| {
                    !reset.input_slots.is_empty()
                        && reset.input_epoch
                            != input.as_ref().map(|value| value.registry.device_epoch)
                }) {
                    if let Some(reset) = graph.reset.take() {
                        let _ = reset
                            .reply
                            .send(Err("Input device changed before reset confirmation".into()));
                    }
                }
                let mut input_applied = graph
                    .reset
                    .as_ref()
                    .is_none_or(|reset| reset.input_slots.is_empty());
                if let Some(input) = input.as_mut() {
                    let publications = input.reader.read()?;
                    for (channel, publication) in input.channels.iter_mut().zip(publications) {
                        if let Some(value) = publication {
                            channel.accept(*value, now);
                        }
                    }
                    if let Some(reset) = graph.reset.as_ref() {
                        input_applied = reset.input_slots.iter().all(|slot| {
                            publications
                                .get(*slot as usize)
                                .and_then(Option::as_ref)
                                .is_some_and(|value| {
                                    value.slot_reset_epoch >= reset.baseline.reset_epoch
                                })
                        });
                    }
                }
                let publications = graph.reader.read()?;
                for (channel, publication) in graph.channels.iter_mut().zip(publications) {
                    if let Some(value) = publication {
                        channel.accept(*value, now);
                    }
                }
                if let Some(reset) = &graph.reset {
                    let applied = input_applied
                        && reset.slots.iter().all(|slot| {
                            publications
                                .get(*slot as usize)
                                .and_then(Option::as_ref)
                                .is_some_and(|value| {
                                    value.slot_reset_epoch >= reset.baseline.reset_epoch
                                })
                        });
                    if applied {
                        if let Some(reset) = graph.reset.take() {
                            graph.confirmed_reset_epoch = reset.baseline.reset_epoch;
                            let mut baselines = graph.endpoint_resets.as_ref().clone();
                            for affected in &reset.baseline.affected {
                                if let Some(baseline) = baselines
                                    .iter_mut()
                                    .find(|baseline| baseline.endpoint_id == affected.endpoint_id)
                                {
                                    *baseline = affected.clone();
                                }
                            }
                            graph.endpoint_resets = Arc::new(baselines);
                            confirmation = Some(reset);
                        }
                    }
                }
                sequence = sequence
                    .checked_add(1)
                    .ok_or("Meter Hub sequence exhausted")?;
                let produced_monotonic_ns = now
                    .as_nanos()
                    .try_into()
                    .map_err(|_| "Meter clock exhausted")?;
                if let Some(audio) = graph.reader.read_transport()? {
                    graph.transport = Some(HubTransportObservation {
                        audio,
                        received_monotonic_ns: produced_monotonic_ns,
                    });
                }
                let input_snapshot = if let Some(input) = input.as_mut() {
                    Some(Arc::new(HubInputSnapshot {
                        registry: input.registry.clone(),
                        records: {
                            let mut records: Vec<_> = input
                                .channels
                                .iter_mut()
                                .enumerate()
                                .map(|(slot, channel)| channel.snapshot(slot as u32, now, true))
                                .collect();
                            if let Some(reset) = graph.reset.as_ref() {
                                preserve_reset_records(
                                    &mut records,
                                    &reset.input_slots,
                                    reset
                                        .previous
                                        .as_ref()
                                        .and_then(|snapshot| snapshot.input.as_ref())
                                        .map(|input| input.records.as_slice()),
                                );
                            }
                            records
                        },
                    }))
                } else {
                    None
                };
                let mut records: Vec<_> = graph
                    .channels
                    .iter_mut()
                    .enumerate()
                    .map(|(slot, channel)| channel.snapshot(slot as u32, now, true))
                    .collect();
                if let Some(reset) = graph.reset.as_ref() {
                    preserve_reset_records(
                        &mut records,
                        &reset.slots,
                        reset
                            .previous
                            .as_ref()
                            .map(|snapshot| snapshot.records.as_slice()),
                    );
                }
                graph.confirmed_reset_epoch = records
                    .iter()
                    .chain(input_snapshot.iter().flat_map(|input| input.records.iter()))
                    .map(|record| record.slot_reset_epoch)
                    .fold(graph.confirmed_reset_epoch, u32::max);
                Ok::<_, String>((
                    Arc::new(HubSnapshot {
                        sequence,
                        produced_monotonic_ns,
                        registry: graph.registry.clone(),
                        records,
                        reset_epoch: graph.confirmed_reset_epoch,
                        endpoint_resets: graph.endpoint_resets.clone(),
                        transport: graph.transport,
                        input: input_snapshot,
                    }),
                    confirmation,
                ))
            })();
            match result {
                Ok((snapshot, confirmation)) => {
                    // Serialize publication with clear/install so an old graph cannot reappear afterward.
                    let control = match shared.control.lock() {
                        Ok(value) => value,
                        Err(_) => return,
                    };
                    if !control.clear && !control.stop {
                        confirmed_reset_epoch = snapshot.reset_epoch;
                        if control.input_change.is_none() {
                            shared.latest.store(Some(snapshot));
                            shared.snapshot_ready.notify_all();
                            if let Some(reset) = confirmation {
                                let _ = reset.reply.send(Ok(reset.baseline));
                            }
                        } else if let Some(reset) = confirmation {
                            graph.reset = Some(reset);
                        }
                    }
                }
                Err(error) => {
                    let mut control = match shared.control.lock() {
                        Ok(value) => value,
                        Err(_) => return,
                    };
                    if !control.clear {
                        control.identity = None;
                        if let Ok(mut last) = shared.error.lock() {
                            *last = Some(error);
                        }
                        shared.latest.store(None);
                        shared.snapshot_ready.notify_all();
                    }
                    installed = None;
                }
            }
        }
        let interval = if shared.visible.load(Ordering::Acquire) {
            Duration::from_nanos(1_000_000_000 / 120)
        } else {
            Duration::from_millis(50)
        };
        let control = match shared.control.lock() {
            Ok(value) => value,
            Err(_) => return,
        };
        if control.stop {
            return;
        }
        if control.clear {
            continue;
        }
        if shared.wake.wait_timeout(control, interval).is_err() {
            return;
        }
    }
}

fn preserve_reset_records(
    records: &mut [WireRecord],
    slots: &[u32],
    previous: Option<&[WireRecord]>,
) {
    use super::protocol_generated::{
        RECORD_FLAGS_STALE, RECORD_FLAGS_UNAVAILABLE, RECORD_FLAGS_VALID,
    };
    for slot in slots {
        if let Some(record) = records.get_mut(*slot as usize) {
            if let Some(prior) = previous.and_then(|records| records.get(*slot as usize)) {
                *record = *prior;
                record.flags =
                    (record.flags & !(RECORD_FLAGS_VALID as u32)) | RECORD_FLAGS_STALE as u32;
            } else {
                *record = WireRecord {
                    slot_id: *slot,
                    flags: RECORD_FLAGS_UNAVAILABLE as u32,
                    block_end_sample: 0,
                    peak: 0.0,
                    rms: 0.0,
                    hold: 0.0,
                    session_peak: 0.0,
                    clip_count: 0,
                    valid_frames: 0,
                    slot_reset_epoch: 0,
                };
            }
        }
    }
}

fn prepare_reset(
    graph: &NativeMeterRegistry,
    input: Option<&NativeInputRegistry>,
    request: &ResetRequest,
    epoch: u32,
) -> Result<(Vec<u32>, Vec<u32>, MeterResetBaseline), String> {
    if request.identity != graph.identity() {
        return Err("Meter graph changed before reset".into());
    }
    if request.endpoints.iter().any(|id| id.starts_with("input/"))
        && request.input_epoch != input.map(|input| input.device_epoch)
    {
        return Err("Input device changed before reset".into());
    }
    let epoch = epoch.checked_add(1).ok_or("Meter reset epoch exhausted")?;
    let mut unique = std::collections::HashSet::new();
    let mut affected = Vec::with_capacity(request.endpoints.len());
    let mut slots = Vec::new();
    let mut input_slots = Vec::new();
    for id in &request.endpoints {
        if !unique.insert(id) {
            continue;
        }
        let mut endpoint_slots: Vec<_> = graph
            .entries
            .iter()
            .filter(|entry| &entry.endpoint_id == id)
            .map(|entry| entry.slot_id)
            .collect();
        if endpoint_slots.is_empty() {
            if let Some(input) = input {
                let selected: Vec<_> = input
                    .entries
                    .iter()
                    .filter(|entry| &entry.endpoint_id == id)
                    .map(|entry| entry.slot_id)
                    .collect();
                input_slots.extend_from_slice(&selected);
                let offset = u32::try_from(graph.entries.len())
                    .map_err(|_| "Meter slot capacity exceeded")?;
                endpoint_slots = selected
                    .into_iter()
                    .map(|slot| {
                        slot.checked_add(offset)
                            .ok_or("Meter slot capacity exceeded")
                    })
                    .collect::<Result<Vec<_>, _>>()?;
            }
        } else {
            slots.extend_from_slice(&endpoint_slots);
        }
        if endpoint_slots.is_empty() {
            return Err("Unknown meter reset endpoint".into());
        }
        affected.push(EndpointResetBaseline {
            endpoint_id: id.clone(),
            slot_ids: endpoint_slots,
            slot_reset_epoch: epoch,
        });
    }
    Ok((
        slots,
        input_slots,
        MeterResetBaseline {
            reset_epoch: epoch,
            affected,
        },
    ))
}

#[cfg(test)]
mod reset_tests {
    use super::super::metadata_generated::{MeterEndpointKind, MeterRegistryEntry, PositiveF64};
    use super::*;

    #[test]
    fn pending_reset_preserves_target_baseline_without_freezing_other_slots() {
        use super::super::protocol_generated::{RECORD_FLAGS_STALE, RECORD_FLAGS_VALID};
        let record = |slot, epoch, end| WireRecord {
            slot_id: slot,
            flags: RECORD_FLAGS_VALID as u32,
            block_end_sample: end,
            peak: 0.25,
            rms: 0.25,
            hold: 0.25,
            session_peak: 0.5,
            clip_count: 0,
            valid_frames: 14400,
            slot_reset_epoch: epoch,
        };
        let previous = vec![record(0, 2, 480), record(1, 0, 480)];
        let mut current = vec![record(0, 3, 960), record(1, 0, 960)];
        preserve_reset_records(&mut current, &[0], Some(&previous));
        assert_eq!(current[0].slot_reset_epoch, 2);
        assert_eq!(current[0].block_end_sample, 480);
        assert_eq!(current[0].flags, RECORD_FLAGS_STALE as u32);
        assert_eq!(current[1], record(1, 0, 960));
    }

    #[test]
    fn mixed_reset_preserves_local_slots_and_rejects_replaced_input() {
        let entry = |slot, id: &str, kind| MeterRegistryEntry {
            slot_id: slot,
            endpoint_id: id.into(),
            kind,
            owner_id: id.into(),
            channel_index: 0,
            channel_count: 1,
            capabilities: Vec::new(),
        };
        let input = NativeInputRegistry {
            device_epoch: 7,
            sample_rate: PositiveF64::new(48000.0).unwrap(),
            entries: vec![
                entry(0, "input/device/0", MeterEndpointKind::Input),
                entry(1, "input/device/1", MeterEndpointKind::Input),
            ],
        };
        let graph = NativeMeterRegistry {
            session_id: "session".into(),
            device_epoch: 7,
            generation: 2,
            registry_revision: 2,
            sample_rate: input.sample_rate,
            entries: vec![entry(0, "track/voice/out", MeterEndpointKind::TrackOut)],
            input: None,
        };
        let (reply, _receive) = oneshot::channel();
        let mut request = ResetRequest {
            identity: graph.identity(),
            input_epoch: Some(7),
            endpoints: vec![
                "input/device/1".into(),
                "track/voice/out".into(),
                "input/device/1".into(),
            ],
            kind: MeterResetKind::All,
            reply,
        };
        let (graph_slots, input_slots, baseline) =
            prepare_reset(&graph, Some(&input), &request, 9).unwrap();
        assert_eq!(graph_slots, vec![0]);
        assert_eq!(input_slots, vec![1]);
        assert_eq!(baseline.reset_epoch, 10);
        assert_eq!(baseline.affected.len(), 2);
        assert_eq!(baseline.affected[0].slot_ids, vec![2]);
        assert_eq!(baseline.affected[1].slot_ids, vec![0]);
        let mut replaced = input.clone();
        replaced.device_epoch = 8;
        assert!(prepare_reset(&graph, Some(&replaced), &request, 9).is_err());
        request.endpoints = vec!["track/voice/out".into()];
        assert!(prepare_reset(&graph, Some(&replaced), &request, 9).is_ok());
        request.endpoints.push("input/missing/0".into());
        assert!(prepare_reset(&graph, Some(&input), &request, 9).is_err());
    }
}
