use crate::{ffi, MainThreadDispatcher, PlaybackService};
use futures_channel::oneshot;
use std::{
    ffi::{c_char, c_void, CString},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};
use zoeydaw_plugin_abi::{OwnedNativeProcessor, PendingProcessor, PreparedFormat};

extern "C" {
    fn zp_plugin_admit(
        session: *mut c_void,
        lease: *const c_char,
        owner: *const c_char,
        device: *const c_char,
        revision: u64,
        processor: OwnedNativeProcessor,
        sample_rate: f64,
        quantum: u32,
        inputs: u32,
        outputs: u32,
        latency: u32,
    ) -> *mut c_char;
    fn zp_plugin_cancel(
        session: *mut c_void,
        lease: *const c_char,
        owner: *const c_char,
        token: u64,
    ) -> *mut c_char;
}

pub struct PluginAdmissionRequest {
    pub lease_id: String,
    pub session_id: String,
    pub device_id: String,
    pub revision: u64,
    pub format: PreparedFormat,
    pub processor: PendingProcessor,
}

fn identity(value: &str) -> Result<CString, String> {
    if value.is_empty() {
        return Err("Empty plugin admission identity".into());
    }
    CString::new(value).map_err(|error| error.to_string())
}

const CANCELLED: u64 = u64::MAX;
struct AdmissionGuard<'a, D: MainThreadDispatcher> {
    main: &'a D,
    service: PlaybackService,
    lease: CString,
    session: CString,
    token: Arc<AtomicU64>,
    armed: bool,
}

fn cancel_on_main(service: &PlaybackService, lease: &CString, session: &CString, token: u64) {
    let handle = service.owner.handle.load(Ordering::Acquire) as *mut c_void;
    if !handle.is_null() {
        let _ = ffi::response(unsafe {
            zp_plugin_cancel(handle, lease.as_ptr(), session.as_ptr(), token)
        });
    }
}

impl<D: MainThreadDispatcher> Drop for AdmissionGuard<'_, D> {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        let token = self.token.swap(CANCELLED, Ordering::AcqRel);
        if token != 0 && token != CANCELLED {
            let service = self.service.clone();
            let lease = self.lease.clone();
            let session = self.session.clone();
            let _ = self
                .main
                .dispatch(move || cancel_on_main(&service, &lease, &session, token));
        }
    }
}

impl PlaybackService {
    pub async fn admit_plugin<D: MainThreadDispatcher>(
        &self,
        main: &D,
        request: PluginAdmissionRequest,
    ) -> Result<u64, String> {
        let lease = identity(&request.lease_id)?;
        let session = identity(&request.session_id)?;
        let device = identity(&request.device_id)?;
        let owner = self.clone();
        let token_state = Arc::new(AtomicU64::new(0));
        let mut guard = AdmissionGuard {
            main,
            service: self.clone(),
            lease: lease.clone(),
            session: session.clone(),
            token: token_state.clone(),
            armed: true,
        };
        let (send, receive) = oneshot::channel::<Result<u64, String>>();
        main.dispatch(move || {
            let result = (|| {
                if token_state.load(Ordering::Acquire) == CANCELLED {
                    return Err("Plugin admission was cancelled".into());
                }
                owner.check_plugin_owner(&request.lease_id, &request.session_id)?;
                let handle = owner.owner.handle.load(Ordering::Acquire) as *mut c_void;
                if handle.is_null() {
                    return Err("Plugin admission requires an open project".into());
                }
                let format = request.format;
                let value = ffi::response(unsafe {
                    zp_plugin_admit(
                        handle,
                        lease.as_ptr(),
                        session.as_ptr(),
                        device.as_ptr(),
                        request.revision,
                        request.processor.into_raw(),
                        format.sample_rate,
                        format.quantum,
                        format.input_channels,
                        format.output_channels,
                        format.latency_frames,
                    )
                })?;
                let token = value
                    .as_str()
                    .ok_or("Invalid plugin admission receipt")?
                    .parse::<u64>()
                    .map_err(|error| error.to_string())?;
                if token_state
                    .compare_exchange(0, token, Ordering::AcqRel, Ordering::Acquire)
                    .is_err()
                {
                    cancel_on_main(&owner, &lease, &session, token);
                    return Err("Plugin admission was cancelled".into());
                }
                Ok(token)
            })();
            let _ = send.send(result);
        })?;
        let token = receive
            .await
            .map_err(|_| "Plugin admission dispatch was cancelled".to_owned())??;
        guard.armed = false;
        Ok(token)
    }

    pub async fn cancel_plugin<D: MainThreadDispatcher>(
        &self,
        main: &D,
        lease_id: String,
        session_id: String,
        token: u64,
    ) -> Result<(), String> {
        let lease = identity(&lease_id)?;
        let session = identity(&session_id)?;
        let owner = self.clone();
        let (send, receive) = oneshot::channel();
        main.dispatch(move || {
            let handle = owner.owner.handle.load(Ordering::Acquire) as *mut c_void;
            let result = if handle.is_null() {
                Ok(())
            } else {
                ffi::response(unsafe {
                    zp_plugin_cancel(handle, lease.as_ptr(), session.as_ptr(), token)
                })
                .map(|_| ())
            };
            let _ = send.send(result);
        })?;
        receive
            .await
            .map_err(|_| "Plugin cancellation dispatch was cancelled".to_owned())?
    }
}
