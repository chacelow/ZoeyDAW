use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

pub(super) struct PendingTelemetry {
    pending: Arc<AtomicBool>,
    #[cfg(feature = "verification")]
    _payload: super::verification::TelemetryPayload,
}

impl PendingTelemetry {
    pub fn acquire(pending: &Arc<AtomicBool>) -> Option<Self> {
        pending
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .ok()?;
        Some(Self {
            pending: Arc::clone(pending),
            #[cfg(feature = "verification")]
            _payload: super::verification::TelemetryPayload::new(),
        })
    }
}

impl Drop for PendingTelemetry {
    fn drop(&mut self) {
        self.pending.store(false, Ordering::Release);
    }
}
