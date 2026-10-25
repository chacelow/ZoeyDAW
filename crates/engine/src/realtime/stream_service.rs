use super::{
    metadata_generated::{MeterInterest, RealtimeRegistry, RealtimeStreamOpenResult},
    streams::MeterStreams,
};
use crate::PlaybackService;

impl PlaybackService {
    pub fn open_meter_stream(
        &self,
        window: &str,
        lease: &str,
        session: &str,
    ) -> Result<RealtimeStreamOpenResult, String> {
        self.check_plugin_owner(lease, session)?;
        let hub = self
            .owner
            .meter_hub
            .lock()
            .map_err(|_| "Meter Hub owner lock poisoned")?
            .as_ref()
            .cloned()
            .ok_or("Meter Hub has no installed graph")?;
        let admission = self
            .owner
            .meter_streams
            .lock()
            .map_err(|_| "Meter stream owner lock poisoned")?
            .reserve(window, lease, session)?;
        let snapshot = hub.wait_snapshot(session, std::time::Duration::from_millis(500));
        let mut streams = self
            .owner
            .meter_streams
            .lock()
            .map_err(|_| "Meter stream owner lock poisoned")?;
        let snapshot = match snapshot {
            Ok(snapshot) => snapshot,
            Err(error) => {
                streams.cancel(&admission);
                return Err(error);
            }
        };
        if let Err(error) = self.check_plugin_owner(lease, session) {
            streams.cancel(&admission);
            return Err(error);
        }
        let opened = hub.finish_stream_admission(&mut streams, admission, &snapshot)?;
        self.sync_meter_interest(&streams)?;
        Ok(opened)
    }

    pub async fn refresh_meter_stream_registry<D: crate::MainThreadDispatcher>(
        &self,
        main: &D,
        window: &str,
        id: u32,
    ) -> Result<Option<RealtimeRegistry>, String> {
        let (lease, session) = {
            let streams = self
                .owner
                .meter_streams
                .lock()
                .map_err(|_| "Meter stream owner lock poisoned")?;
            let (lease, session) = streams.identity(window, id)?;
            (lease.to_owned(), session.to_owned())
        };
        if self
            .refresh_meter_hub(main, lease, session.clone())
            .await?
            .is_none()
        {
            return Ok(None);
        }
        let hub = self
            .owner
            .meter_hub
            .lock()
            .map_err(|_| "Meter Hub owner lock poisoned")?
            .as_ref()
            .cloned()
            .ok_or("Meter Hub has no installed graph")?;
        hub.wait_snapshot(&session, std::time::Duration::from_millis(500))?;
        self.meter_stream_registry(window, id).map(Some)
    }

    pub fn meter_stream_registry(&self, window: &str, id: u32) -> Result<RealtimeRegistry, String> {
        let mut streams = self
            .owner
            .meter_streams
            .lock()
            .map_err(|_| "Meter stream owner lock poisoned")?;
        let (lease, session) = streams.identity(window, id)?;
        let snapshot = self
            .meter_snapshot(lease, session)?
            .ok_or("Meter Hub snapshot is not ready")?;
        let registry = streams.registry(window, id, &snapshot)?;
        drop(streams);
        self.dispatch_meter_events()?;
        Ok(registry)
    }

    pub fn meter_stream_clock_probe(
        &self,
        window: &str,
        id: u32,
    ) -> Result<Option<super::metadata_generated::ClockProbe>, String> {
        use super::metadata_generated::{ClockProbe, JsonU64};
        let streams = self
            .owner
            .meter_streams
            .lock()
            .map_err(|_| "Meter stream owner lock poisoned")?;
        let (lease, session) = streams.identity(window, id)?;
        let (lease, session) = (lease.to_owned(), session.to_owned());
        drop(streams);
        self.check_plugin_owner(&lease, &session)?;
        let owner = self
            .owner
            .meter_hub
            .lock()
            .map_err(|_| "Meter Hub owner lock poisoned")?;
        let hub = owner
            .as_ref()
            .cloned()
            .ok_or("Meter Hub has no installed graph")?;
        drop(owner);
        let Some(snapshot) = hub
            .snapshot()
            .filter(|snapshot| snapshot.registry.session_id == session)
        else {
            return Ok(None);
        };
        let streams = self
            .owner
            .meter_streams
            .lock()
            .map_err(|_| "Meter stream owner lock poisoned")?;
        let (current_lease, current_session) = streams.identity(window, id)?;
        if current_lease != lease || current_session != session {
            return Err("Meter clock owner changed".into());
        }
        self.check_plugin_owner(&lease, &session)?;
        let Some(audio) = snapshot.transport else {
            return Ok(None);
        };
        Ok(Some(ClockProbe {
            monotonic_ns: JsonU64(hub.monotonic_ns().ok_or("Meter clock exhausted")?),
            device_epoch: snapshot
                .input
                .as_ref()
                .map_or(snapshot.registry.device_epoch, |input| {
                    input.registry.device_epoch
                }),
            time_samples: JsonU64(audio.audio.device_sample),
            sample_rate: snapshot.registry.sample_rate,
        }))
    }

    pub fn meter_stream_snapshot(
        &self,
        window: &str,
        id: u32,
        after_seq: u64,
    ) -> Result<Vec<u8>, String> {
        use super::{levels::encode_levels, protocol_generated::*};
        let permit = self
            .owner
            .meter_streams
            .lock()
            .map_err(|_| "Meter stream owner lock poisoned")?
            .begin_read(window, id)?;
        let Some(snapshot) = self.meter_snapshot(&permit.lease, &permit.session)? else {
            return Ok(Vec::new());
        };
        let device_epoch = snapshot
            .input
            .as_ref()
            .map_or(snapshot.registry.device_epoch, |input| {
                input.registry.device_epoch
            });
        if snapshot.registry.generation != permit.generation
            || device_epoch != permit.device_epoch
            || snapshot.reset_epoch != permit.reset_epoch
            || snapshot.registry.sources != permit.registry.sources
        {
            return Err("meter-registry-required".into());
        }
        if (snapshot.sequence <= after_seq && !permit.subscription_changed)
            || permit.slots.is_empty()
        {
            return Ok(Vec::new());
        }
        let Some(transport) = snapshot.transport else {
            return Ok(Vec::new());
        };
        let records = snapshot.select_records(&permit.slots)?;
        let header = WireHeader {
            magic: MAGIC as u32,
            version: VERSION as u16,
            header_bytes: HEADER_BYTES as u16,
            generation: permit.generation,
            registry_revision: permit.registry_revision,
            stream_id: id,
            slot_count: 0,
            seq: snapshot.sequence,
            time_samples: transport.audio.device_sample,
            sample_rate: snapshot.registry.sample_rate.get(),
            produced_monotonic_ns: snapshot.produced_monotonic_ns,
            control_generation: 0,
            accepted_revision: 0,
            audio_revision: 0,
            subscription_revision: permit.subscription_revision,
            flags: HEADER_FLAGS_REVISIONS_UNAVAILABLE as u32
                | if permit.subscription_changed {
                    HEADER_FLAGS_SUBSCRIPTION_CHANGED as u32
                } else {
                    0
                }
                | if transport.audio.playing == 1 {
                    HEADER_FLAGS_PLAYING as u32
                } else {
                    0
                },
            timeline_sample: transport.audio.timeline_sample,
            timeline_beat: transport.audio.timeline_beat,
            tempo_bpm: transport.audio.tempo_bpm,
            device_epoch,
            source_count: 0,
            reset_epoch: snapshot.reset_epoch,
            frame_type: FRAME_TYPES_LEVELS as u32,
        };
        let bytes = encode_levels(header, &records, &snapshot.sources)
            .ok_or("Invalid Hub binary snapshot")?;
        let mut streams = self
            .owner
            .meter_streams
            .lock()
            .map_err(|_| "Meter stream owner lock poisoned")?;
        self.check_plugin_owner(&permit.lease, &permit.session)?;
        if !streams.read_is_current(window, &permit) {
            return Ok(Vec::new());
        }
        let current = self.meter_snapshot(&permit.lease, &permit.session)?;
        if current.as_ref().is_none_or(|current| {
            current.registry.identity() != snapshot.registry.identity()
                || current.registry.sources != snapshot.registry.sources
                || current.reset_epoch != snapshot.reset_epoch
                || current
                    .input
                    .as_ref()
                    .map(|input| input.registry.device_epoch)
                    != snapshot
                        .input
                        .as_ref()
                        .map(|input| input.registry.device_epoch)
        }) {
            return Ok(Vec::new());
        }
        if !streams.complete_read(window, &permit) {
            return Ok(Vec::new());
        }
        Ok(bytes)
    }

    pub fn set_meter_interest(&self, window: &str, interest: MeterInterest) -> Result<(), String> {
        let mut streams = self
            .owner
            .meter_streams
            .lock()
            .map_err(|_| "Meter stream owner lock poisoned")?;
        let (lease, session) = streams.identity(window, interest.stream_id)?;
        self.check_plugin_owner(lease, session)?;
        streams.set_interest(window, interest)?;
        self.sync_meter_interest(&streams)
    }

    pub fn close_meter_stream(&self, window: &str, id: u32) -> Result<(), String> {
        let mut streams = self
            .owner
            .meter_streams
            .lock()
            .map_err(|_| "Meter stream owner lock poisoned")?;
        streams.close(window, id)?;
        self.sync_meter_interest(&streams)
    }

    pub fn close_meter_window(&self, window: &str) -> Result<(), String> {
        let mut streams = self
            .owner
            .meter_streams
            .lock()
            .map_err(|_| "Meter stream owner lock poisoned")?;
        streams.close_window(window);
        self.sync_meter_interest(&streams)
    }

    pub(crate) fn close_meter_lease(&self, lease: &str) -> Result<(), String> {
        let mut streams = self
            .owner
            .meter_streams
            .lock()
            .map_err(|_| "Meter stream owner lock poisoned")?;
        streams.close_lease(lease);
        self.sync_meter_interest(&streams)
    }

    fn sync_meter_interest(&self, streams: &MeterStreams) -> Result<(), String> {
        let owner = self
            .owner
            .meter_hub
            .lock()
            .map_err(|_| "Meter Hub owner lock poisoned")?;
        if let Some(hub) = owner.as_ref() {
            if let Some(session) = hub.session_id() {
                hub.set_visible(&session, !streams.visible_interest(&session).is_empty())?;
            }
        }
        Ok(())
    }
}
