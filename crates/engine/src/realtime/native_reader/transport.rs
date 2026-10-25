use super::NativeMeterReader;
use std::ffi::c_void;

#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct NativeTransportObservation {
    pub reference_sample: u64,
    pub device_sample: u64,
    pub timeline_sample: i64,
    pub timeline_beat: f64,
    pub tempo_bpm: f64,
    pub frames: u32,
    pub playing: u32,
    pub control_generation: u64,
    pub applied_sequence: u64,
    pub bar: f64,
    pub bars_per_second: f64,
    pub owner_epoch: u64,
    pub control_valid: u32,
    pub recording: u32,
    pub audible_bar: f64,
    pub audible_bars_per_second: f64,
    pub audible_valid: u32,
    pub reserved: u32,
}
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct NativeStoppedTransport {
    pub owner_epoch: u64,
    pub control_generation: u64,
    pub applied_sequence: u64,
    pub bar: f64,
    pub bars_per_second: f64,
}
extern "C" {
    fn zp_meter_read_clock(handle: *mut c_void, output: *mut NativeTransportObservation) -> u32;
    fn zp_meter_read_stopped_clock(handle: *mut c_void, output: *mut NativeStoppedTransport)
        -> u32;
}

impl NativeMeterReader {
    pub fn read_stopped_transport(&mut self) -> Result<Option<NativeStoppedTransport>, String> {
        let mut value = NativeStoppedTransport::default();
        if unsafe { zp_meter_read_stopped_clock(self.handle.as_ptr(), &mut value) } == 0 {
            return Ok(None);
        }
        if value.owner_epoch == 0
            || !value.bar.is_finite()
            || !value.bars_per_second.is_finite()
            || value.bars_per_second <= 0.0
        {
            return Err("Invalid native stopped transport observation".into());
        }
        Ok(Some(value))
    }
    pub fn read_transport(&mut self) -> Result<Option<NativeTransportObservation>, String> {
        let mut value = NativeTransportObservation::default();
        if unsafe { zp_meter_read_clock(self.handle.as_ptr(), &mut value) } == 0 {
            return Ok(None);
        }
        if !value.timeline_beat.is_finite()
            || !value.tempo_bpm.is_finite()
            || value.tempo_bpm <= 0.0
            || value.frames == 0
            || value.playing > 1
            || value.control_valid > 1
            || value.recording > 1
            || !value.bar.is_finite()
            || !value.bars_per_second.is_finite()
            || value.bars_per_second <= 0.0
            || (value.control_valid == 1 && value.owner_epoch == 0)
            || value.audible_valid > 1
            || value.reserved != 0
            || (value.audible_valid == 1
                && (!value.audible_bar.is_finite()
                    || !value.audible_bars_per_second.is_finite()
                    || value.audible_bars_per_second <= 0.0))
        {
            return Err("Invalid native transport observation".into());
        }
        Ok(Some(value))
    }
}
