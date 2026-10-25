use super::{
    metadata_generated::{
        JsonU64, MeterInterest, RealtimeCounters, RealtimeEvent, RealtimeEventContext,
        RealtimeEventPayload, RealtimeRegistry, RealtimeStreamOpenResult,
    },
    meter_hub::HubSnapshot,
};
use std::collections::{BTreeSet, HashMap};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

const MAX_STREAMS: usize = 64;
const MAX_ENDPOINTS: usize = 8192;

struct Stream {
    window: String,
    lease: String,
    session: String,
    registry: Arc<RealtimeRegistry>,
    interest: Option<MeterInterest>,
    reading: Arc<AtomicBool>,
    delivered: Option<(u32, u32, u32)>,
    events: Option<Arc<dyn Fn(Vec<RealtimeEvent>) -> Result<(), String> + Send + Sync>>,
}

pub struct StreamAdmission(u32);

pub struct MeterReadPermit {
    stream_id: u32,
    reading: Arc<AtomicBool>,
    pub lease: String,
    pub session: String,
    pub registry_revision: u32,
    pub registry: Arc<RealtimeRegistry>,
    pub generation: u32,
    pub device_epoch: u32,
    pub reset_epoch: u32,
    pub subscription_revision: u32,
    pub slots: Vec<u32>,
    pub transport: bool,
    pub subscription_changed: bool,
}

impl Drop for MeterReadPermit {
    fn drop(&mut self) {
        self.reading.store(false, Ordering::Release);
    }
}

struct PendingAdmission {
    window: String,
    lease: String,
    session: String,
}

#[derive(Default)]
pub struct MeterStreams {
    next_stream: u32,
    next_session: u32,
    session: Option<(String, u32)>,
    streams: HashMap<u32, Stream>,
    pending: HashMap<u32, PendingAdmission>,
    registry: Option<Arc<RealtimeRegistry>>,
    events: super::events::EventLog,
}

impl MeterStreams {
    pub fn reserve(
        &mut self,
        window: &str,
        lease: &str,
        session: &str,
    ) -> Result<StreamAdmission, String> {
        if window.is_empty() || lease.is_empty() || session.is_empty() {
            return Err("Invalid meter stream owner".into());
        }
        if self.streams.len() + self.pending.len() >= MAX_STREAMS {
            return Err("Meter stream capacity reached".into());
        }
        if self
            .streams
            .values()
            .any(|stream| stream.window == window && stream.session == session)
            || self
                .pending
                .values()
                .any(|pending| pending.window == window)
        {
            return Err("Window already owns a meter stream".into());
        }
        let id = self
            .next_stream
            .checked_add(1)
            .ok_or("Meter stream identity exhausted")?;
        self.next_stream = id;
        self.pending.insert(
            id,
            PendingAdmission {
                window: window.into(),
                lease: lease.into(),
                session: session.into(),
            },
        );
        Ok(StreamAdmission(id))
    }

    pub fn cancel(&mut self, admission: &StreamAdmission) {
        self.pending.remove(&admission.0);
    }

    pub fn finish(
        &mut self,
        admission: StreamAdmission,
        snapshot: &HubSnapshot,
    ) -> Result<RealtimeStreamOpenResult, String> {
        let pending = self
            .pending
            .remove(&admission.0)
            .ok_or("Meter stream admission was cancelled")?;
        let session = &snapshot.registry.session_id;
        if &pending.session != session {
            return Err("Meter stream session changed during admission".into());
        }
        let session_epoch = match &self.session {
            Some((current, epoch)) if current == session => *epoch,
            _ => self
                .next_session
                .checked_add(1)
                .ok_or("Meter session epoch exhausted")?,
        };
        let id = admission.0;
        let registry_revision = self
            .registry
            .as_ref()
            .filter(|registry| registry.session_id == *session)
            .map_or(1, |registry| registry.registry_revision);
        snapshot.realtime_registry(session_epoch, registry_revision)?;
        if self
            .session
            .as_ref()
            .is_none_or(|(current, _)| current != session)
        {
            self.streams.clear();
            self.events = super::events::EventLog::default();
            self.registry = None;
            self.pending
                .retain(|_, pending| &pending.session == session);
            self.next_session = session_epoch;
            self.session = Some((session.clone(), session_epoch));
        }
        self.refresh_registry(snapshot, session_epoch)?;
        let registry = self
            .registry
            .as_ref()
            .ok_or("Meter registry missing")?
            .clone();
        self.events.open(id, session, session_epoch)?;
        self.streams.insert(
            id,
            Stream {
                window: pending.window,
                lease: pending.lease,
                session: pending.session,
                registry: registry.clone(),
                interest: None,
                reading: Arc::new(AtomicBool::new(false)),
                delivered: None,
                events: None,
            },
        );
        Ok(RealtimeStreamOpenResult {
            stream_id: id,
            registry: registry.as_ref().clone(),
        })
    }

    fn owned(&self, window: &str, id: u32) -> Result<&Stream, String> {
        let stream = self.streams.get(&id).ok_or("Unknown meter stream")?;
        if stream.window != window {
            return Err("Meter stream window mismatch".into());
        }
        Ok(stream)
    }

    pub fn identity(&self, window: &str, id: u32) -> Result<(&str, &str), String> {
        let stream = self.owned(window, id)?;
        Ok((&stream.lease, &stream.session))
    }

    pub fn registry(
        &mut self,
        window: &str,
        id: u32,
        snapshot: &HubSnapshot,
    ) -> Result<RealtimeRegistry, String> {
        let stream = self.owned(window, id)?;
        if stream.session != snapshot.registry.session_id {
            return Err("Meter stream session changed".into());
        }
        let epoch = stream.registry.session_epoch;
        self.refresh_registry(snapshot, epoch)?;
        self.registry
            .as_ref()
            .map(|registry| registry.as_ref().clone())
            .ok_or_else(|| "Meter registry missing".into())
    }

    fn refresh_registry(&mut self, snapshot: &HubSnapshot, epoch: u32) -> Result<(), String> {
        let revision = self
            .registry
            .as_ref()
            .map_or(1, |registry| registry.registry_revision);
        let mut next = snapshot.realtime_registry(epoch, revision)?;
        if let Some(prior) = self.registry.as_ref() {
            if next.session_id != prior.session_id
                || next.generation < prior.generation
                || next.device_epoch < prior.device_epoch
                || next.reset_epoch < prior.reset_epoch
            {
                return Err("Retired meter snapshot".into());
            }
            if next.generation != prior.generation
                || next.device_epoch != prior.device_epoch
                || next.entries != prior.entries
                || next.sources != prior.sources
            {
                next.registry_revision = prior
                    .registry_revision
                    .checked_add(1)
                    .ok_or("Meter registry revision exhausted")?;
            }
            if prior.as_ref() == &next {
                return Ok(());
            }
        }
        self.events.append(
            event_context(&next),
            RealtimeEventPayload::Registry {
                registry: next.clone(),
            },
        )?;
        let next = Arc::new(next);
        for stream in self.streams.values_mut() {
            stream.registry = next.clone();
        }
        self.registry = Some(next);
        Ok(())
    }

    pub fn bind_events(
        &mut self,
        window: &str,
        id: u32,
        send: Arc<dyn Fn(Vec<RealtimeEvent>) -> Result<(), String> + Send + Sync>,
    ) -> Result<(), String> {
        let stream = self.owned(window, id)?;
        if stream.events.is_some() {
            return Err("Meter event channel already bound".into());
        }
        self.streams
            .get_mut(&id)
            .ok_or("Unknown meter stream")?
            .events = Some(send);
        Ok(())
    }

    pub fn receipt(&mut self, window: &str, id: u32, through: u64) -> Result<(), String> {
        self.owned(window, id)?;
        self.events.receipt(id, through)
    }

    pub fn append_reset(
        &mut self,
        session: &str,
        reset: super::metadata_generated::MeterResetKind,
        baseline: super::metadata_generated::MeterResetBaseline,
    ) -> Result<(), String> {
        let registry = self
            .registry
            .as_ref()
            .filter(|registry| registry.session_id == session)
            .ok_or("Meter event session changed")?;
        self.events.append(
            event_context(registry),
            RealtimeEventPayload::MeterReset { reset, baseline },
        )?;
        Ok(())
    }

    pub fn event_deliveries(
        &mut self,
    ) -> Result<
        Vec<(
            String,
            u32,
            Arc<dyn Fn(Vec<RealtimeEvent>) -> Result<(), String> + Send + Sync>,
            Vec<RealtimeEvent>,
        )>,
        String,
    > {
        let counters = RealtimeCounters {
            xruns: JsonU64(0),
            recording_overruns: JsonU64(0),
            note_overruns: JsonU64(0),
            automation_overruns: JsonU64(0),
            plugin_faults: JsonU64(0),
            dropped_events: JsonU64(0),
        };
        let mut deliveries = Vec::new();
        for (id, stream) in &self.streams {
            if let Some(send) = stream.events.as_ref() {
                let batch =
                    self.events
                        .batch(*id, &event_context(&stream.registry), &counters, &[])?;
                if !batch.is_empty() {
                    deliveries.push((stream.window.clone(), *id, send.clone(), batch));
                }
            }
        }
        Ok(deliveries)
    }

    pub fn set_interest(&mut self, window: &str, interest: MeterInterest) -> Result<(), String> {
        let stream = self.owned(window, interest.stream_id)?;
        if interest.endpoint_ids.len() > MAX_ENDPOINTS || interest.revision == 0 {
            return Err("Invalid meter interest".into());
        }
        if let Some(prior) = &stream.interest {
            if interest.revision < prior.revision {
                return Err("Stale meter interest revision".into());
            }
            if interest.revision == prior.revision {
                return if &interest == prior {
                    Ok(())
                } else {
                    Err("Meter interest revision reused".into())
                };
            }
        }
        let unique: BTreeSet<_> = interest.endpoint_ids.iter().collect();
        if unique.len() != interest.endpoint_ids.len() || unique.iter().any(|id| id.is_empty()) {
            return Err("Invalid meter interest endpoints".into());
        }
        let stream_id = interest.stream_id;
        self.streams
            .get_mut(&stream_id)
            .ok_or("Unknown meter stream")?
            .interest = Some(interest);
        Ok(())
    }

    pub fn slots(&self, window: &str, id: u32) -> Result<Vec<u32>, String> {
        let stream = self.owned(window, id)?;
        let Some(interest) = &stream.interest else {
            return Ok(Vec::new());
        };
        if !interest.visible {
            return Ok(Vec::new());
        }
        let ids: BTreeSet<_> = interest.endpoint_ids.iter().collect();
        Ok(stream
            .registry
            .entries
            .iter()
            .filter(|entry| ids.contains(&entry.endpoint_id))
            .map(|entry| entry.slot_id)
            .collect())
    }

    pub fn begin_read(&self, window: &str, id: u32) -> Result<MeterReadPermit, String> {
        let stream = self.owned(window, id)?;
        if stream.reading.swap(true, Ordering::AcqRel) {
            return Err("meter-busy".into());
        }
        Ok(MeterReadPermit {
            stream_id: id,
            reading: stream.reading.clone(),
            lease: stream.lease.clone(),
            session: stream.session.clone(),
            registry_revision: stream.registry.registry_revision,
            registry: stream.registry.clone(),
            generation: stream.registry.generation,
            device_epoch: stream.registry.device_epoch,
            reset_epoch: stream.registry.reset_epoch,
            subscription_revision: stream
                .interest
                .as_ref()
                .map_or(0, |interest| interest.revision),
            slots: self.slots(window, id)?,
            transport: stream
                .interest
                .as_ref()
                .is_some_and(|interest| interest.visible && interest.transport),
            subscription_changed: stream.delivered
                != Some((
                    stream.registry.registry_revision,
                    stream.registry.reset_epoch,
                    stream
                        .interest
                        .as_ref()
                        .map_or(0, |interest| interest.revision),
                )),
        })
    }

    pub fn read_is_current(&self, window: &str, permit: &MeterReadPermit) -> bool {
        self.owned(window, permit.stream_id).is_ok_and(|stream| {
            Arc::ptr_eq(&stream.reading, &permit.reading)
                && stream.registry.registry_revision == permit.registry_revision
                && stream.registry.reset_epoch == permit.reset_epoch
                && stream
                    .interest
                    .as_ref()
                    .map_or(0, |interest| interest.revision)
                    == permit.subscription_revision
        })
    }

    pub fn complete_read(&mut self, window: &str, permit: &MeterReadPermit) -> bool {
        if !self.read_is_current(window, permit) {
            return false;
        }
        if let Some(stream) = self.streams.get_mut(&permit.stream_id) {
            stream.delivered = Some((
                permit.registry_revision,
                permit.reset_epoch,
                permit.subscription_revision,
            ));
        }
        true
    }

    pub fn visible_interest(&self, session: &str) -> Vec<String> {
        self.streams
            .values()
            .filter(|stream| stream.session == session)
            .filter_map(|stream| stream.interest.as_ref())
            .filter(|interest| interest.visible)
            .flat_map(|interest| interest.endpoint_ids.iter().cloned())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect()
    }
    pub fn has_visible_interest(&self, session: &str) -> bool {
        self.streams
            .values()
            .filter(|stream| stream.session == session)
            .filter_map(|stream| stream.interest.as_ref())
            .any(|interest| {
                interest.visible && (interest.transport || !interest.endpoint_ids.is_empty())
            })
    }

    pub fn close(&mut self, window: &str, id: u32) -> Result<(), String> {
        self.owned(window, id)?;
        self.streams.remove(&id);
        self.events.close(id);
        Ok(())
    }
    pub fn close_window(&mut self, window: &str) {
        for (id, stream) in &self.streams {
            if stream.window == window {
                self.events.close(*id);
            }
        }
        self.streams.retain(|_, stream| stream.window != window);
        self.pending.retain(|_, pending| pending.window != window);
    }
    pub fn close_lease(&mut self, lease: &str) {
        for (id, stream) in &self.streams {
            if stream.lease == lease {
                self.events.close(*id);
            }
        }
        self.streams.retain(|_, stream| stream.lease != lease);
        self.pending.retain(|_, pending| pending.lease != lease);
    }
}

fn event_context(registry: &RealtimeRegistry) -> RealtimeEventContext {
    RealtimeEventContext {
        session_id: registry.session_id.clone(),
        session_epoch: registry.session_epoch,
        stream_id: 0,
        device_epoch: registry.device_epoch,
        generation: registry.generation,
        registry_revision: registry.registry_revision,
        seq: JsonU64(0),
    }
}
