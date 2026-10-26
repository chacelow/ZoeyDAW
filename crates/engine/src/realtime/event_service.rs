use super::metadata_generated::{MeterResetBaseline, MeterResetKind, PluginFaultKind, RealtimeEvent};
use crate::PlaybackService;
use std::sync::Arc;

pub struct PluginFaultReport {
    pub session_id: String,
    pub track_id: String,
    pub device_id: String,
    pub fault_id: String,
    pub fault: PluginFaultKind,
    pub code: String,
    pub message: String,
    pub recoverable: bool,
}

impl PlaybackService {
    pub fn publish_plugin_faults(&self, window: &str, lease: &str, reports: Vec<PluginFaultReport>) -> Result<(),String> {
        for report in &reports { self.check_plugin_owner(lease,&report.session_id)?; }
        self.owner.meter_streams.lock().map_err(|_|"Meter stream owner lock poisoned")?
            .update_plugin_faults(window,lease,reports)?;
        self.dispatch_meter_events()
    }
    pub fn bind_meter_events(
        &self,
        window: &str,
        id: u32,
        send: Arc<dyn Fn(Vec<RealtimeEvent>) -> Result<(), String> + Send + Sync>,
    ) -> Result<(), String> {
        {
            let mut streams = self
                .owner
                .meter_streams
                .lock()
                .map_err(|_| "Meter stream owner lock poisoned")?;
            let (lease, session) = streams.identity(window, id)?;
            self.check_plugin_owner(lease, session)?;
            streams.bind_events(window, id, send)?;
        }
        self.dispatch_meter_events()
    }

    pub fn meter_event_receipt(&self, window: &str, id: u32, through: u64) -> Result<(), String> {
        {
            let mut streams = self
                .owner
                .meter_streams
                .lock()
                .map_err(|_| "Meter stream owner lock poisoned")?;
            let (lease, session) = streams.identity(window, id)?;
            self.check_plugin_owner(lease, session)?;
            streams.receipt(window, id, through)?;
        }
        self.dispatch_meter_events()
    }

    pub(crate) fn dispatch_meter_events(&self) -> Result<(), String> {
        let deliveries = self
            .owner
            .meter_streams
            .lock()
            .map_err(|_| "Meter stream owner lock poisoned")?
            .event_deliveries()?;
        for (window, id, send, batch) in deliveries {
            if send(batch).is_err() {
                self.close_meter_stream(&window, id)?;
            }
        }
        Ok(())
    }

    pub async fn reset_meter_stream(
        &self,
        window: &str,
        id: u32,
        endpoints: Vec<String>,
        kind: MeterResetKind,
    ) -> Result<MeterResetBaseline, String> {
        let (lease, session, identity) = {
            let streams = self
                .owner
                .meter_streams
                .lock()
                .map_err(|_| "Meter stream owner lock poisoned")?;
            let (lease, session) = streams.identity(window, id)?;
            let snapshot = self
                .meter_snapshot(lease, session)?
                .ok_or("Meter Hub snapshot is not ready")?;
            (
                lease.to_owned(),
                session.to_owned(),
                snapshot.registry.identity(),
            )
        };
        let baseline = self
            .meter_reset(&lease, &session, identity, endpoints, kind.clone())
            .await?;
        {
            let mut streams = self
                .owner
                .meter_streams
                .lock()
                .map_err(|_| "Meter stream owner lock poisoned")?;
            let (current_lease, current_session) = streams.identity(window, id)?;
            if current_lease != lease || current_session != session {
                return Err("Meter reset owner changed".into());
            }
            let snapshot = self
                .meter_snapshot(&lease, &session)?
                .ok_or("Meter Hub snapshot is not ready")?;
            if snapshot.registry.identity() != identity {
                return Err("Meter graph changed after reset".into());
            }
            streams.registry(window, id, &snapshot)?;
            streams.append_reset(&session, kind, baseline.clone())?;
        }
        self.dispatch_meter_events()?;
        Ok(baseline)
    }
}
