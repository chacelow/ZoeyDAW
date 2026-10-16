use std::sync::atomic::{AtomicU32, Ordering};

use napi_derive::napi;

static TELEMETRY_PAYLOADS: AtomicU32 = AtomicU32::new(0);
static CLEANUP_OWNERS: AtomicU32 = AtomicU32::new(0);

pub(super) struct TelemetryPayload;
impl TelemetryPayload {
    pub fn new() -> Self {
        TELEMETRY_PAYLOADS.fetch_add(1, Ordering::Relaxed);
        Self
    }
}
impl Drop for TelemetryPayload {
    fn drop(&mut self) {
        TELEMETRY_PAYLOADS.fetch_sub(1, Ordering::Relaxed);
    }
}

pub(super) struct CleanupOwner;
impl CleanupOwner {
    pub fn new() -> Self {
        CLEANUP_OWNERS.fetch_add(1, Ordering::Relaxed);
        Self
    }
}
impl Drop for CleanupOwner {
    fn drop(&mut self) {
        CLEANUP_OWNERS.fetch_sub(1, Ordering::Relaxed);
    }
}

#[napi(object)]
pub struct EngineVerificationResources {
    pub telemetry_payloads: u32,
    pub cleanup_owners: u32,
    pub sessions: u32,
}

#[napi]
pub fn engine_verification_resources() -> napi::Result<EngineVerificationResources> {
    let sessions = super::handles()
        .lock()
        .map_err(|_| super::error("engine handle lock poisoned"))?
        .len() as u32;
    Ok(EngineVerificationResources {
        telemetry_payloads: TELEMETRY_PAYLOADS.load(Ordering::Relaxed),
        cleanup_owners: CLEANUP_OWNERS.load(Ordering::Relaxed),
        sessions,
    })
}
