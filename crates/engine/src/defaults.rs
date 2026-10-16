//! Processing policy shared by the control thread and audio source preparation.

pub const PEAK_BIN_FRAMES: u32 = 64;
pub const PEAK_LEVELS: usize = 32;
pub const RESAMPLE_CHUNK_FRAMES: usize = 1024;
pub const TELEMETRY_INTERVAL_MICROS: u64 = 33_333;
pub const TELEMETRY_FLOOR_DB: f64 = -120.0;

// Protocol allocation limit: stereo peak replies contain at most 65,536 f32 values.
pub const MAX_PEAK_PIXELS: usize = 16_384;
