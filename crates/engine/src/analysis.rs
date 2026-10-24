use crate::ffi::*;
use crate::service::MAX_SAFE_INTEGER;
use crate::PlaybackService;
use serde_json::Value;
use std::ffi::CString;
use std::sync::atomic::Ordering;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WaveformRangeRequest {
    path: String,
    start_frame: u64,
    frame_count: u64,
    columns: u32,
    frames_per_bin: u32,
}

impl WaveformRangeRequest {
    fn validate(&self) -> Result<(), String> {
        if self.path.is_empty() || self.path.contains('\0') { return Err("Invalid waveform path".into()); }
        if self.start_frame > MAX_SAFE_INTEGER || self.frame_count == 0 || self.frame_count > MAX_SAFE_INTEGER {
            return Err("Invalid waveform frame range".into());
        }
        if !(1..=4096).contains(&self.columns) { return Err("Waveform columns must be between 1 and 4096".into()); }
        if !self.frames_per_bin.is_power_of_two() { return Err("Waveform frames per bin must be a positive power of two".into()); }
        if self.start_frame % u64::from(self.frames_per_bin) != 0 { return Err("Waveform range start must align to frames per bin".into()); }
        Ok(())
    }
}

pub struct WaveformJob {
    path: String,
    bins: u32,
    generation: u64,
}

impl WaveformJob {
    pub fn execute(self) -> Result<Value, String> {
        let path = CString::new(self.path).map_err(|error| error.to_string())?;
        response(unsafe { zp_waveform(path.as_ptr(), self.bins, self.generation) })
    }
}

pub struct WaveformRangeJob {
    request: WaveformRangeRequest,
    generation: u64,
}

impl WaveformRangeJob {
    pub fn execute(self) -> Result<Value, String> {
        let path = CString::new(self.request.path).map_err(|error| error.to_string())?;
        response(unsafe { zp_waveform_range(path.as_ptr(), self.request.start_frame, self.request.frame_count, self.request.columns, self.request.frames_per_bin, self.generation) })
    }
}

impl PlaybackService {
    pub fn prepare_waveform(&self, path: String, bins: u32) -> Result<WaveformJob, String> {
        if !(1..=4096).contains(&bins) { return Err("Waveform bins must be between 1 and 4096".into()); }
        let generation = self.owner.waveform_generation.fetch_add(1, Ordering::AcqRel) + 1;
        unsafe { zp_waveform_fence(generation) };
        Ok(WaveformJob { path, bins, generation })
    }

    pub fn prepare_waveform_range(&self, request: WaveformRangeRequest) -> Result<WaveformRangeJob, String> {
        request.validate()?;
        let generation = self.owner.advance_waveform_range()?;
        Ok(WaveformRangeJob { request, generation })
    }

    pub fn cancel_waveform_ranges(&self) -> Result<(), String> {
        self.owner.advance_waveform_range()?;
        Ok(())
    }
}

pub fn analyze_tempo(path: String) -> Result<Value, String> {
    let path = CString::new(path).map_err(|error| error.to_string())?;
    response(unsafe { zp_analyze_tempo(path.as_ptr()) })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn waveform_range_validates_safe_frames_columns_and_paths() {
        let valid = json!({"path": "/float.wav", "startFrame": 0, "frameCount": MAX_SAFE_INTEGER, "columns": 4096, "framesPerBin": 2147483648_u32});
        assert!(serde_json::from_value::<WaveformRangeRequest>(valid.clone()).unwrap().validate().is_ok());
        for (key, value) in [
            ("path", json!("")), ("path", json!("/bad\0.wav")),
            ("startFrame", json!(MAX_SAFE_INTEGER + 1)),
            ("frameCount", json!(0)), ("frameCount", json!(MAX_SAFE_INTEGER + 1)),
            ("columns", json!(0)), ("columns", json!(4097)),
            ("framesPerBin", json!(0)), ("framesPerBin", json!(3)), ("startFrame", json!(1)),
        ] {
            let mut invalid = valid.clone();
            invalid[key] = value;
            assert!(serde_json::from_value::<WaveformRangeRequest>(invalid).unwrap().validate().is_err(), "Accepted invalid {key}");
        }
        for (key, value) in [("startFrame", json!(-1)), ("frameCount", json!(1.5)), ("columns", json!(2.5)), ("framesPerBin", json!(1.5)), ("framesPerBin", json!(4294967296_u64)), ("invented", json!(true))] {
            let mut invalid = valid.clone();
            invalid[key] = value;
            assert!(serde_json::from_value::<WaveformRangeRequest>(invalid).is_err(), "Accepted malformed {key}");
        }
        let mut missing = valid.clone();
        missing.as_object_mut().unwrap().remove("framesPerBin");
        assert!(serde_json::from_value::<WaveformRangeRequest>(missing).is_err(), "Missing bin size must reject");
        for (start, count, columns, bin_size) in [(3, 8192, 4096, 1), (16, 9, 3, 4), (2147483648_u64, MAX_SAFE_INTEGER, 4096, 2147483648_u32)] {
            let request = json!({"path": "/float.wav", "startFrame": start, "frameCount": count, "columns": columns, "framesPerBin": bin_size});
            assert!(serde_json::from_value::<WaveformRangeRequest>(request).unwrap().validate().is_ok(), "Valid aligned request rejected");
        }
    }
}
