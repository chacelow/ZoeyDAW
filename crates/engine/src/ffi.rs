use std::ffi::{c_char, c_void, CStr};
use serde_json::Value;

#[repr(C)]
pub(crate) struct WaveformCancellation {
    pub context: *const c_void,
    pub is_cancelled: unsafe extern "C" fn(*const c_void) -> i32,
}

extern "C" {
    pub(crate) fn zp_create(error: *mut *mut c_char) -> *mut c_void;
    pub(crate) fn zp_call(session: *mut c_void, operation: *const c_char, json: *const c_char) -> *mut c_char;
    pub(crate) fn zp_apply_prepared(session: *mut c_void, json: *const c_char, processors: *mut zoeydaw_plugin_abi::NativePreparedPlugin, count: u32) -> *mut c_char;
    pub(crate) fn zp_configure_prepared(session: *mut c_void, json: *const c_char, processors: *mut zoeydaw_plugin_abi::NativePreparedPlugin, count: u32) -> *mut c_char;
    pub(crate) fn zp_free(buffer: *mut c_char);
    pub(crate) fn zp_stop_fence_for(session: *mut c_void, lease: *const c_char, session_id: *const c_char, token: u64) -> i32;
    pub(crate) fn zp_pending_call_begin(session: *mut c_void, lease: *const c_char, session_id: *const c_char) -> i32;
    pub(crate) fn zp_pending_call_end(session: *mut c_void);
    pub(crate) fn zp_audition_fence(session: *mut c_void, generation: u64);
    pub(crate) fn zp_waveform(path: *const c_char, bins: u32, cancellation: *const WaveformCancellation) -> *mut c_char;
    pub(crate) fn zp_waveform_range(path: *const c_char, start_frame: u64, frame_count: u64, columns: u32, frames_per_bin: u32, cancellation: *const WaveformCancellation) -> *mut c_char;
    pub(crate) fn zp_analyze_tempo(path: *const c_char) -> *mut c_char;
}

pub(crate) fn take_buffer(buffer: *mut c_char) -> Result<String, String> {
    if buffer.is_null() {
        return Err("Native playback could not allocate its response".into());
    }
    let text = unsafe { CStr::from_ptr(buffer).to_string_lossy().into_owned() };
    unsafe { zp_free(buffer) };
    Ok(text)
}

pub(crate) fn response(buffer: *mut c_char) -> Result<Value, String> {
    parse_response(&take_buffer(buffer)?)
}

pub(crate) fn parse_response(text: &str) -> Result<Value, String> {
    let envelope: Value = serde_json::from_str(text)
        .map_err(|error| format!("Invalid native playback response: {error}"))?;
    if envelope.get("ok").and_then(Value::as_bool) == Some(true) {
        Ok(envelope.get("value").cloned().unwrap_or(Value::Null))
    } else {
        Err(envelope.get("error").and_then(Value::as_str)
            .unwrap_or("Native playback failed").to_owned())
    }
}
