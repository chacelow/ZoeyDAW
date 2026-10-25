use super::{
    meter_hub::{HubSnapshot, MeterHub},
    native_reader::NativeMeterRegistry,
};
use crate::{ffi, MainThreadDispatcher, PlaybackService};
use futures_channel::oneshot;
use std::{
    ffi::{c_void, CString},
    sync::{atomic::Ordering, Arc},
};

impl PlaybackService {
    /// Refreshes low-frequency graph metadata; high-rate snapshot reads never dispatch to main.
    pub async fn refresh_meter_hub<D: MainThreadDispatcher>(
        &self,
        main: &D,
        lease_id: String,
        session_id: String,
    ) -> Result<NativeMeterRegistry, String> {
        let service = self.clone();
        let (send, receive) = oneshot::channel();
        main.dispatch(move || {
            if send.is_canceled() {
                return;
            }
            let result = (|| {
                service.check_plugin_owner(&lease_id, &session_id)?;
                let handle = service.owner.handle.load(Ordering::Acquire) as *mut c_void;
                if handle.is_null() {
                    return Err("Meter Hub requires an open project".into());
                }
                let operation = CString::new("meter_registry").unwrap();
                let payload = CString::new(
                    serde_json::json!({"leaseId":lease_id,"sessionId":session_id}).to_string(),
                )
                .map_err(|error| error.to_string())?;
                let value = ffi::response(unsafe {
                    ffi::zp_call(handle, operation.as_ptr(), payload.as_ptr())
                })?;
                let mut owner = service
                    .owner
                    .meter_hub
                    .lock()
                    .map_err(|_| "Meter Hub owner lock poisoned")?;
                let registry: NativeMeterRegistry =
                    serde_json::from_value(value).map_err(|error| error.to_string())?;
                registry.validate(&session_id)?;
                if owner.is_none() {
                    *owner = Some(Arc::new(MeterHub::start()?));
                }
                let hub = owner.as_ref().ok_or("Meter Hub owner missing")?;
                match registry.input.as_ref() {
                    Some(input) if hub.input_epoch() != Some(input.device_epoch) => {
                        let reader =
                            service.acquire_input_reader_on_main(&lease_id, &session_id, input)?;
                        hub.install_input(input.clone(), reader)?;
                    }
                    None if hub.input_epoch().is_some() => hub.clear_input()?,
                    _ => {}
                }
                if hub.identity() == Some(registry.identity())
                    && hub.session_id().as_deref() == Some(session_id.as_str())
                {
                    hub.refresh_source_registry(&registry)?;
                    return Ok(registry);
                }
                let reader =
                    service.acquire_meter_reader_on_main(&lease_id, &session_id, &registry)?;
                hub.install(registry.clone(), reader)?;
                if let Err(error) = service.check_plugin_owner(&lease_id, &session_id) {
                    hub.clear()?;
                    return Err(error);
                }
                Ok(registry)
            })();
            let _ = send.send(result);
        })?;
        receive
            .await
            .map_err(|_| "Meter Hub refresh cancelled".to_owned())?
    }

    pub fn meter_snapshot(
        &self,
        lease_id: &str,
        session_id: &str,
    ) -> Result<Option<Arc<HubSnapshot>>, String> {
        self.check_plugin_owner(lease_id, session_id)?;
        let owner = self
            .owner
            .meter_hub
            .lock()
            .map_err(|_| "Meter Hub owner lock poisoned")?;
        let Some(hub) = owner.as_ref() else {
            return Ok(None);
        };
        if let Some(error) = hub.error() {
            return Err(error);
        }
        Ok(hub
            .snapshot()
            .filter(|snapshot| snapshot.registry.session_id == session_id))
    }

    pub fn meter_visible(
        &self,
        lease_id: &str,
        session_id: &str,
        visible: bool,
    ) -> Result<(), String> {
        self.check_plugin_owner(lease_id, session_id)?;
        if let Some(hub) = self
            .owner
            .meter_hub
            .lock()
            .map_err(|_| "Meter Hub owner lock poisoned")?
            .as_ref()
        {
            hub.set_visible(session_id, visible)?;
        }
        Ok(())
    }

    pub async fn meter_reset(
        &self,
        lease_id: &str,
        session_id: &str,
        identity: super::native_reader::MeterGraphIdentity,
        endpoints: Vec<String>,
        kind: super::metadata_generated::MeterResetKind,
    ) -> Result<super::metadata_generated::MeterResetBaseline, String> {
        self.check_plugin_owner(lease_id, session_id)?;
        let hub = self
            .owner
            .meter_hub
            .lock()
            .map_err(|_| "Meter Hub owner lock poisoned")?
            .as_ref()
            .cloned()
            .ok_or("Meter Hub has no installed graph")?;
        let baseline = hub.reset(session_id, identity, endpoints, kind).await?;
        self.check_plugin_owner(lease_id, session_id)?;
        Ok(baseline)
    }
}
