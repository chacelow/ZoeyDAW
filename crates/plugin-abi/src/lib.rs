use std::ffi::c_void;

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct NativeMidi {
    pub offset: u32,
    pub port: u32,
    pub bytes: [u8; 3],
    pub reserved: u8,
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct NativeAutomation {
    pub slot: u32,
    pub offset: u32,
    pub parameter: u64,
    pub value: f64,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct NativeTransport {
    pub sample_position: i64,
    pub beat_position: f64,
    pub tempo: f64,
    pub bar_start: f64,
    pub bar_number: i32,
    pub numerator: u16,
    pub denominator: u16,
    pub flags: u32,
    pub loop_start: f64,
    pub loop_end: f64,
    pub loop_sample_start: i64,
    pub loop_sample_end: i64,
}

#[repr(C)]
pub struct NativeBlock {
    pub inputs: *const *const f32,
    pub outputs: *const *mut f32,
    pub midi: *const NativeMidi,
    pub automation: *const NativeAutomation,
    pub produced: *mut NativeMidi,
    pub transport: *const NativeTransport,
    pub frames: u32,
    pub input_channels: u32,
    pub output_channels: u32,
    pub midi_count: u32,
    pub automation_count: u32,
    pub produced_capacity: u32,
    pub produced_count: u32,
}

#[repr(C)]
pub struct OwnedNativeProcessor {
    pub context: *mut c_void,
    pub process: unsafe extern "C" fn(*mut c_void, *mut NativeBlock) -> i32,
    pub release: unsafe extern "C" fn(*mut c_void),
}

pub struct PendingProcessor(Option<OwnedNativeProcessor>);

// SAFETY: construction requires an exclusively owned processor that may move between control threads.
unsafe impl Send for PendingProcessor {}

impl PendingProcessor {
    /// # Safety
    /// The descriptor exclusively owns its context. Processing and release must be valid on the
    /// receiving control/audio threads. Release must be valid on any non-audio thread before transfer.
    pub unsafe fn new(processor: OwnedNativeProcessor) -> Self {
        Self(Some(processor))
    }

    pub fn into_raw(mut self) -> OwnedNativeProcessor {
        self.0
            .take()
            .expect("Pending processor already transferred")
    }
}

impl Drop for PendingProcessor {
    fn drop(&mut self) {
        if let Some(processor) = self.0.take() {
            unsafe { (processor.release)(processor.context) };
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct PreparedFormat {
    pub sample_rate: f64,
    pub quantum: u32,
    pub input_channels: u32,
    pub output_channels: u32,
    pub latency_frames: u32,
}

#[repr(C)]
pub struct NativePreparedPlugin {
    pub device_id: *const std::ffi::c_char,
    pub processor: OwnedNativeProcessor,
    pub sample_rate: f64,
    pub quantum: u32,
    pub input_channels: u32,
    pub output_channels: u32,
    pub latency_frames: u32,
}

pub struct PreparedPlugin {
    pub device_id: String,
    pub format: PreparedFormat,
    pub processor: PendingProcessor,
}
