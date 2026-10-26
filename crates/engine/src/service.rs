use crate::dispatch::MainThreadDispatcher;
use crate::ffi::*;
use futures_channel::oneshot;
use serde_json::{json, Value};
use std::ffi::{c_void, CString};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::collections::{HashMap, HashSet};

#[derive(Default)]
pub(crate) struct Owner {
    // Created once on the UI thread and retained until process exit; release closes its devices/Edits.
    pub(crate) handle: AtomicUsize,
    stop_epoch: AtomicU64,
    released_leases: Mutex<HashSet<String>>,
    lease_stop_tokens: Mutex<HashMap<String, HashMap<String, LeaseSession>>>,
    audition_generation: AtomicU64,
    pub(crate) waveform_generation: AtomicU64,
    pub(crate) waveform_range_generation: AtomicU64,
    pub(crate) meter_hub: Mutex<Option<Arc<crate::realtime::meter_hub::MeterHub>>>,
    pub(crate) meter_streams: Mutex<crate::realtime::streams::MeterStreams>,
}

pub(crate) const MAX_SAFE_INTEGER: u64 = (1 << 53) - 1;
const MAX_PLAYBACK_LEASES: usize = 64;

#[derive(Default)]
struct NoteQueue { pending: AtomicUsize, overrun: AtomicBool }

#[derive(Default)]
struct LeaseSession { stop_token: u64, notes: Arc<NoteQueue> }

struct NotePermit { queue: Arc<NoteQueue>, overflow: bool }

impl Drop for NotePermit {
    fn drop(&mut self) {
        if self.overflow { self.queue.overrun.store(false, Ordering::Release); }
        else { self.queue.pending.fetch_sub(1, Ordering::AcqRel); }
    }
}

struct PendingCall { handle: usize }

impl Drop for PendingCall {
    fn drop(&mut self) { unsafe { zp_pending_call_end(self.handle as *mut c_void) }; }
}

impl Owner {
    fn request_was_stopped(&self, lease: &str, session: &str, token: u64) -> Result<bool, String> {
        let tokens = self.lease_stop_tokens.lock().map_err(|_| "Playback stop lock poisoned")?;
        Ok(tokens.get(lease).and_then(|sessions| sessions.get(session)).is_some_and(|latest| token < latest.stop_token))
    }
    fn note_queue(&self, lease: &str, session: &str) -> Result<Arc<NoteQueue>, String> {
        let sessions = self.lease_stop_tokens.lock().map_err(|_| "Playback stop lock poisoned")?;
        sessions.get(lease).and_then(|sessions| sessions.get(session)).map(|state| state.notes.clone())
            .ok_or_else(|| "Unknown playback lease/session".to_owned())
    }
    pub(crate) fn advance_waveform_range(&self) -> Result<u64, String> {
        let generation = self.waveform_range_generation.fetch_update(Ordering::AcqRel, Ordering::Acquire, |current| current.checked_add(1))
            .map_err(|_| "Waveform range generation limit reached".to_owned())? + 1;
        unsafe { zp_waveform_range_fence(generation) };
        Ok(generation)
    }

    fn reserve_audition(&self) -> Result<u64, String> {
        let generation = self.audition_generation.fetch_update(Ordering::AcqRel, Ordering::Acquire, |current| {
            (current < MAX_SAFE_INTEGER).then(|| current + 1)
        }).map_err(|_| "Audition generation limit reached".to_owned())? + 1;
        let handle = self.handle.load(Ordering::Acquire) as *mut c_void;
        if !handle.is_null() { unsafe { zp_audition_fence(handle, generation) }; }
        Ok(generation)
    }

    fn is_current_audition(&self, generation: u64) -> bool {
        generation > 0 && generation == self.audition_generation.load(Ordering::Acquire)
    }
}

#[derive(Clone, Default)]
pub struct PlaybackService {
    pub(crate) owner: Arc<Owner>,
}

impl PlaybackService {
    pub(crate) fn check_plugin_owner(&self, lease: &str, session: &str) -> Result<(), String> {
        let released = self.owner.released_leases.lock().map_err(|_| "Playback lease lock poisoned")?;
        if released.contains(lease) { return Err("Playback lease was released".into()); }
        let leases = self.owner.lease_stop_tokens.lock().map_err(|_| "Playback stop lock poisoned")?;
        if !leases.get(lease).is_some_and(|sessions| sessions.contains_key(session)) {
            return Err("Playback lease/session was not acquired".into());
        }
        Ok(())
    }
    fn handle_on_main(&self) -> Result<*mut c_void, String> {
        let mut handle = self.owner.handle.load(Ordering::Acquire) as *mut c_void;
        if handle.is_null() {
            let mut error = std::ptr::null_mut();
            handle = unsafe { zp_create(&mut error) };
            if handle.is_null() {
                return Err(if error.is_null() { "Cannot initialize native playback".into() }
                    else { take_buffer(error)? });
            }
            self.owner.handle.store(handle as usize, Ordering::Release);
            unsafe {
                zp_audition_fence(handle, self.owner.audition_generation.load(Ordering::Acquire));
            }
        }
        Ok(handle)
    }

    async fn invoke<D: MainThreadDispatcher>(&self, main: &D, operation: &'static str, payload: Value) -> Result<Value, String> {
        self.invoke_prepared(main, operation, payload, Vec::new()).await
    }

    async fn invoke_prepared<D: MainThreadDispatcher>(&self, main: &D, mut operation: &'static str, payload: Value, prepared: Vec<zoeydaw_plugin_abi::PreparedPlugin>) -> Result<Value, String> {
        let lease = payload.get("leaseId").and_then(Value::as_str).map(str::to_owned);
        let session = payload.get("request").and_then(|request| request.get("sessionId")).or_else(|| payload.get("sessionId")).and_then(Value::as_str).map(str::to_owned);
        let request_stop_token = payload.get("stopToken").and_then(Value::as_u64).unwrap_or(0);
        let stale_response = if matches!(operation, "apply" | "control" | "note") {
            let code = if operation == "apply" && payload["request"]["stage"].as_str() == Some("open") { "superseded-open" } else { "rejected" };
            let mut result = json!({"kind": "rejected", "sessionId": session, "sequence": payload["request"]["sequence"], "code": code});
            if let Some(generation) = payload.get("request").and_then(|request| request.get("controlGeneration")) {
                result["controlGeneration"] = generation.clone();
            }
            Some(json!({"ok": true, "value": result}).to_string())
        } else { None };
        let audition_generation = if matches!(operation, "audition" | "audition_stop" | "audition_seek" | "audition_status") {
            Some(payload.get("generation").and_then(Value::as_u64).ok_or("Invalid audition generation")?)
        } else { None };
        let permit = if operation == "note" {
            let queue = self.owner.note_queue(lease.as_deref().ok_or("Invalid lease")?, session.as_deref().ok_or("Invalid session")?)?;
            if queue.pending.fetch_update(Ordering::AcqRel, Ordering::Acquire, |count| (count < 4096).then(|| count + 1)).is_ok() {
                Some(NotePermit { queue, overflow: false })
            } else {
                if queue.overrun.swap(true, Ordering::AcqRel) {
                    return Ok(json!({"kind": "rejected", "sessionId": session, "sequence": payload["request"]["sequence"], "code": "note-overrun"}));
                }
                operation = "note_overrun";
                Some(NotePermit { queue, overflow: true })
            }
        } else { None };
        let operation_c = CString::new(operation).map_err(|error| error.to_string())?;
        let payload_json = CString::new(payload.to_string()).map_err(|error| error.to_string())?;
        let pending_identity = if operation == "apply" {
            Some((CString::new(lease.as_deref().ok_or("Invalid lease")?).map_err(|error| error.to_string())?,
                CString::new(session.as_deref().ok_or("Invalid session")?).map_err(|error| error.to_string())?))
        } else { None };
        let owner = self.clone();
        let execution_lease = lease;
        let execution_session = session;
        let (send, receive) = oneshot::channel();
        main.dispatch(move || {
            let _permit = permit;
            let result = (|| {
                if operation=="configure_prepared" {
                    owner.check_plugin_owner(execution_lease.as_deref().ok_or("Invalid lease")?,execution_session.as_deref().ok_or("Invalid session")?)?;
                }
                if matches!(operation, "apply" | "control" | "note" | "note_overrun" | "all_notes_off") {
                    let lease = execution_lease.as_deref().ok_or("Invalid lease")?;
                    if owner.owner.released_leases.lock().map_err(|_| "Playback lease lock poisoned")?.contains(lease) {
                        return Err("Playback lease was released".into());
                    }
                    let session = execution_session.as_deref().ok_or("Invalid session")?;
                    if operation != "all_notes_off" && owner.owner.request_was_stopped(lease, session, request_stop_token)? {
                        return Ok(stale_response);
                    }
                }
                let pending_call = if let Some((lease, session)) = pending_identity {
                    let handle = owner.handle_on_main()?;
                    if unsafe { zp_pending_call_begin(handle, lease.as_ptr(), session.as_ptr()) } == 0 {
                        return Err("Cannot register pending playback owner".into());
                    }
                    Some(PendingCall { handle: handle as usize })
                } else { None };
                if pending_call.is_some() && owner.owner.request_was_stopped(
                    execution_lease.as_deref().ok_or("Invalid lease")?,
                    execution_session.as_deref().ok_or("Invalid session")?, request_stop_token)? {
                    return Ok(stale_response);
                }
                if let Some(generation) = audition_generation {
                    if !owner.owner.is_current_audition(generation) {
                        if operation == "audition_stop" { return Ok(None); }
                        return Err("Stale audition generation".into());
                    }
                }
                let handle = match &pending_call { Some(pending) => pending.handle as *mut c_void, None => owner.handle_on_main()? };
                if (operation == "apply" && !prepared.is_empty()) || operation=="configure_prepared" {
                    let identities = prepared.iter().map(|item| CString::new(item.device_id.as_str()).map_err(|error| error.to_string())).collect::<Result<Vec<_>, _>>()?;
                    let mut processors = Vec::with_capacity(prepared.len());
                    for (item, id) in prepared.into_iter().zip(&identities) {
                        processors.push(zoeydaw_plugin_abi::NativePreparedPlugin {
                            device_id: id.as_ptr(), processor: item.processor.into_raw(), sample_rate: item.format.sample_rate,
                            quantum: item.format.quantum, input_channels: item.format.input_channels,
                            output_channels: item.format.output_channels, latency_frames: item.format.latency_frames,
                        });
                    }
                    let response=unsafe {
                        if operation=="configure_prepared" { crate::ffi::zp_configure_prepared(handle,payload_json.as_ptr(),processors.as_mut_ptr(),processors.len() as u32) }
                        else { zp_apply_prepared(handle,payload_json.as_ptr(),processors.as_mut_ptr(),processors.len() as u32) }
                    };
                    take_buffer(response).map(Some)
                } else {
                    take_buffer(unsafe { zp_call(handle, operation_c.as_ptr(), payload_json.as_ptr()) }).map(Some)
                }
            })();
            let _ = send.send(result);
        }).map_err(|error| error.to_string())?;
        let raw = receive.await.map_err(|_| "Main-thread playback operation was cancelled".to_owned())??;
        let value = match raw { Some(raw) => parse_response(&raw)?, None => Value::Null };
        Ok(value)
    }
}

impl PlaybackService {
pub fn acquire(&self, lease_id: String, session_id: String) -> Result<(), String> {
    if lease_id.is_empty() || lease_id.as_bytes().contains(&0) { return Err("Invalid lease".into()); }
    if session_id.is_empty() || session_id.as_bytes().contains(&0) { return Err("Invalid session".into()); }
    let released = self.owner.released_leases.lock().map_err(|_| "Playback lease lock poisoned")?;
    if released.contains(&lease_id) { return Err("Playback lease was released".into()); }
    let mut leases = self.owner.lease_stop_tokens.lock().map_err(|_| "Playback stop lock poisoned")?;
    if let Some(sessions) = leases.get(&lease_id) {
        return if sessions.contains_key(&session_id) { Ok(()) }
            else { Err("Playback lease is already admitted for another session".into()) };
    }
    if leases.len() >= MAX_PLAYBACK_LEASES { return Err("Playback lease capacity reached".into()); }
    leases.insert(lease_id, HashMap::from([(session_id, LeaseSession::default())]));
    Ok(())
}

pub async fn plugin_prepare_plan<D: MainThreadDispatcher>(&self, main: &D, request: Value, lease_id: String) -> Result<Value, String> {
    let session=request.get("sessionId").and_then(Value::as_str).ok_or("Invalid session")?;
    self.check_plugin_owner(&lease_id,session)?;
    self.invoke(main,"plugin_prepare_plan",json!({"request":request,"leaseId":lease_id})).await
}

pub async fn apply<D: MainThreadDispatcher>(&self, main: &D, request: Value, lease_id: String, stop_token: u64) -> Result<Value, String> {
    self.apply_prepared(main, request, lease_id, stop_token, Vec::new()).await
}

pub async fn apply_prepared<D: MainThreadDispatcher>(&self, main: &D, request: Value, lease_id: String, stop_token: u64, prepared: Vec<zoeydaw_plugin_abi::PreparedPlugin>) -> Result<Value, String> {
    if prepared.len() > 256 { return Err("Prepared plugin capacity exceeded".into()); }
    let session = request.get("sessionId").and_then(Value::as_str).filter(|session| !session.is_empty() && !session.as_bytes().contains(&0)).ok_or("Invalid session")?;
    if lease_id.is_empty() || lease_id.as_bytes().contains(&0) { return Err("Invalid lease".into()); }
    if stop_token > MAX_SAFE_INTEGER { return Err("Invalid stop token".into()); }
    {
        let released = self.owner.released_leases.lock().map_err(|_| "Playback lease lock poisoned")?;
        if released.contains(&lease_id) { return Err("Playback lease was released".into()); }
        let leases = self.owner.lease_stop_tokens.lock().map_err(|_| "Playback stop lock poisoned")?;
        if !leases.get(&lease_id).is_some_and(|sessions| sessions.contains_key(session)) {
            return Err("Playback lease was not acquired".into());
        }
    }
    let epoch = self.owner.stop_epoch.load(Ordering::Acquire);
    self.invoke_prepared(main, "apply", json!({"request": request, "leaseId": lease_id, "stopToken": stop_token, "stopEpoch": epoch}), prepared).await
}

pub async fn control<D: MainThreadDispatcher>(&self, main: &D, request: Value, lease_id: String, stop_token: u64) -> Result<Value, String> {
    let epoch = self.owner.stop_epoch.load(Ordering::Acquire);
    self.invoke(main, "control", json!({"request": request, "leaseId": lease_id, "stopToken": stop_token, "stopEpoch": epoch})).await
}

pub async fn note<D: MainThreadDispatcher>(&self, main: &D, request: Value, lease_id: String, stop_token: u64) -> Result<Value, String> {
    let epoch = self.owner.stop_epoch.load(Ordering::Acquire);
    self.invoke(main, "note", json!({"request": request, "leaseId": lease_id, "stopToken": stop_token, "stopEpoch": epoch})).await
}

pub async fn all_notes_off<D: MainThreadDispatcher>(&self, main: &D, lease_id: String, session_id: String, through_sequence: u64) -> Result<(), String> {
    if through_sequence > MAX_SAFE_INTEGER { return Err("Invalid note cutoff sequence".into()); }
    self.invoke(main, "all_notes_off", json!({"leaseId": lease_id, "sessionId": session_id, "throughSequence": through_sequence})).await.map(|_| ())
}

pub async fn telemetry<D: MainThreadDispatcher>(&self, main: &D, lease_id: String) -> Result<Value, String> {
    self.invoke(main, "telemetry", json!({"leaseId": lease_id})).await
}

pub async fn plugin_editor_authority<D: MainThreadDispatcher>(&self, main: &D, session_id: String, device_id: String, context: usize, instance: u64, active: bool) -> Result<(), String> {
    self.invoke(main, "plugin_editor_authority", json!({"sessionId":session_id,"deviceId":device_id,"context":context.to_string(),"instanceId":instance.to_string(),"active":active})).await.map(|_| ())
}
pub async fn plugin_recovery_plan<D: MainThreadDispatcher>(&self, main: &D, session_id: String, device_id: String, context: usize) -> Result<Value, String> {
    self.invoke(main,"plugin_recovery_plan",json!({"sessionId":session_id,"deviceId":device_id,"context":context.to_string()})).await
}



pub async fn recording_results<D: MainThreadDispatcher>(&self, main: &D, lease_id: String, session_id: String) -> Result<Value, String> {
    self.invoke(main, "recording_results", json!({"leaseId":lease_id,"sessionId":session_id})).await
}

pub async fn recording_ack<D: MainThreadDispatcher>(&self, main: &D, lease_id: String, session_id: String, recording_id: String, accepted_revision: u64) -> Result<(), String> {
    if accepted_revision > MAX_SAFE_INTEGER { return Err("Invalid recording revision".into()); }
    self.invoke(main, "recording_ack", json!({"leaseId":lease_id,"sessionId":session_id,"recordingId":recording_id,"acceptedRevision":accepted_revision})).await.map(|_| ())
}

pub async fn release<D: MainThreadDispatcher>(&self, main: &D, lease_id: String) -> Result<(), String> {
    self.owner.released_leases.lock().map_err(|_| "Playback lease lock poisoned")?.insert(lease_id.clone());
    self.owner.lease_stop_tokens.lock().map_err(|_| "Playback stop lock poisoned")?.remove(&lease_id);
    self.close_meter_lease(&lease_id)?;
    if self.owner.lease_stop_tokens.lock().map_err(|_| "Playback stop lock poisoned")?.is_empty() {
        if let Some(hub)=self.owner.meter_hub.lock().map_err(|_| "Meter Hub owner lock poisoned")?.as_ref() { hub.clear()?; }
    }
    self.invoke(main, "release", json!({"leaseId": lease_id})).await.map(|_| ())
}

pub async fn stop<D: MainThreadDispatcher>(&self, main: &D, lease_id: String, session_id: String, stop_token: u64) -> Result<(), String> {
    if stop_token > MAX_SAFE_INTEGER { return Err("Invalid stop token".into()); }
    if self.owner.released_leases.lock().map_err(|_| "Playback lease lock poisoned")?.contains(&lease_id) { return Ok(()); }
    let lease_c = CString::new(lease_id.as_str()).map_err(|error| error.to_string())?;
    let session_c = CString::new(session_id.as_str()).map_err(|error| error.to_string())?;
    let epoch = {
        let mut tokens = self.owner.lease_stop_tokens.lock().map_err(|_| "Playback stop lock poisoned")?;
        let Some(latest) = tokens.get_mut(&lease_id).and_then(|sessions| sessions.get_mut(&session_id)) else { return Ok(()); };
        if stop_token < latest.stop_token { return Ok(()); }
        let epoch = self.owner.stop_epoch.fetch_update(Ordering::AcqRel, Ordering::Acquire, |current|
            (current < MAX_SAFE_INTEGER).then(|| current + 1))
            .map_err(|_| "Playback stop epoch limit reached".to_owned())? + 1;
        if stop_token > latest.stop_token { latest.notes = Arc::new(NoteQueue::default()); }
        latest.stop_token = stop_token;
        epoch
    };
    let handle = self.owner.handle.load(Ordering::Acquire) as *mut c_void;
    if !handle.is_null() { unsafe { zp_stop_fence_for(handle, lease_c.as_ptr(), session_c.as_ptr(), epoch) }; }
    self.invoke(main, "stop", json!({"leaseId": lease_id, "sessionId": session_id, "stopToken": stop_token, "stopEpoch": epoch})).await.map(|_| ())
}

pub fn reserve_audition(&self) -> Result<u64, String> {
    self.owner.reserve_audition()
}

pub async fn audition<D: MainThreadDispatcher>(&self, main: &D, request: Value) -> Result<Value, String> {
    let generation = request.get("generation").and_then(Value::as_u64).ok_or("Invalid audition generation")?;
    if !self.owner.is_current_audition(generation) { return Err("Stale audition generation".into()); }
    self.invoke(main, "audition", request).await
}

pub async fn audition_stop<D: MainThreadDispatcher>(&self, main: &D, generation: u64) -> Result<(), String> {
    if !self.owner.is_current_audition(generation) { return Ok(()); }
    self.invoke(main, "audition_stop", json!({"generation": generation})).await.map(|_| ())
}

pub async fn audition_seek<D: MainThreadDispatcher>(&self, main: &D, generation: u64, normalized: f64) -> Result<(), String> {
    self.invoke(main, "audition_seek", json!({"generation": generation, "normalized": normalized})).await.map(|_| ())
}

pub async fn audition_status<D: MainThreadDispatcher>(&self, main: &D, generation: u64) -> Result<Value, String> {
    self.invoke(main, "audition_status", json!({"generation": generation})).await
}

pub async fn devices<D: MainThreadDispatcher>(&self, main: &D) -> Result<Value, String> {
    self.invoke(main, "devices", json!({})).await
}

pub async fn configure_device<D: MainThreadDispatcher>(&self, main: &D, request: Value) -> Result<Value, String> {
    self.invoke(main, "configure", request).await
}

pub async fn configuration_plan<D: MainThreadDispatcher>(&self, main: &D, request: Value) -> Result<Value,String> {
    self.invoke(main,"configuration_plan",request).await
}

pub async fn configure_device_prepared<D: MainThreadDispatcher>(&self, main: &D, payload: Value, prepared: Vec<zoeydaw_plugin_abi::PreparedPlugin>) -> Result<Value,String> {
    if prepared.len()>256 { return Err("Prepared plugin capacity exceeded".into()); }
    let lease=payload.get("leaseId").and_then(Value::as_str).ok_or("Missing configuration lease")?;
    let session=payload.get("sessionId").and_then(Value::as_str).ok_or("Missing configuration session")?;
    self.check_plugin_owner(lease,session)?;
    self.invoke_prepared(main,"configure_prepared",payload,prepared).await
}

pub async fn device_capabilities<D: MainThreadDispatcher>(&self, main: &D, request: Value) -> Result<Value, String> {
    self.invoke(main, "device_capabilities", request).await
}

pub async fn device_control_panel<D: MainThreadDispatcher>(&self, main: &D) -> Result<Value, String> {
    self.invoke(main, "device_control_panel", json!({})).await
}
}

#[cfg(test)]
#[path = "service_tests.rs"]
mod tests;
