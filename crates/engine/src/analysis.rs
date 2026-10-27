use crate::ffi::*;
use crate::service::MAX_SAFE_INTEGER;
use crate::PlaybackService;
use serde_json::Value;
use std::ffi::{c_void, CString};
use std::collections::HashMap;
use std::sync::{Arc, atomic::{AtomicU64, Ordering}};

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

#[derive(Default)]
struct WindowWaveforms {
    overview: Arc<AtomicU64>,
    range: Arc<AtomicU64>,
}
#[derive(Default)]
pub(crate) struct WaveformWindows(HashMap<String, Option<WindowWaveforms>>);
enum WaveformKind { Overview, Range }
struct WaveformTicket { generation: Arc<AtomicU64>, expected: u64 }
impl WaveformWindows {
    fn prepare(&mut self, window: &str, kind: WaveformKind) -> Result<WaveformTicket, String> {
        if !self.0.contains_key(window) { self.0.insert(window.to_owned(), Some(WindowWaveforms::default())); }
        let jobs = self.0.get_mut(window).and_then(Option::as_mut).ok_or("Waveform window is closed")?;
        let generation = match kind { WaveformKind::Overview => &jobs.overview, WaveformKind::Range => &jobs.range };
        let expected = Self::advance(generation)?;
        Ok(WaveformTicket { generation: generation.clone(), expected })
    }
    fn advance(generation: &AtomicU64) -> Result<u64, String> {
        let next = generation.load(Ordering::Relaxed).checked_add(1).filter(|value| *value < u64::MAX)
            .ok_or("Waveform window generation limit reached")?;
        generation.store(next, Ordering::Release);
        Ok(next)
    }
    fn cancel_ranges(&mut self, window: &str) -> Result<(), String> {
        if let Some(Some(jobs)) = self.0.get(window) { Self::advance(&jobs.range)?; }
        Ok(())
    }
    fn close(&mut self, window: &str) {
        let jobs = match self.0.get_mut(window) {
            Some(slot) => slot.take(),
            None => { self.0.insert(window.to_owned(), None);None }
        };
        if let Some(jobs) = jobs {
            for generation in [jobs.overview, jobs.range] { generation.store(u64::MAX, Ordering::Release); }
        }
    }
}
impl Drop for WaveformWindows {
    fn drop(&mut self) {
        for jobs in self.0.values().flatten() {
            for generation in [&jobs.overview, &jobs.range] { generation.store(u64::MAX, Ordering::Release); }
        }
    }
}

fn cancellation(ticket: &WaveformTicket) -> WaveformCancellation {
    unsafe extern "C" fn is_cancelled(context: *const c_void) -> i32 {
        // Native only borrows this ticket during execute; the job retains it for that call.
        let ticket = unsafe { &*context.cast::<WaveformTicket>() };
        i32::from(ticket.generation.load(Ordering::Acquire) != ticket.expected)
    }
    WaveformCancellation { context: (ticket as *const WaveformTicket).cast(), is_cancelled }
}

pub struct WaveformJob {
    path: String,
    bins: u32,
    cancelled: WaveformTicket,
}

impl WaveformJob {
    pub fn execute(self) -> Result<Value, String> {
        let path = CString::new(self.path).map_err(|error| error.to_string())?;
        let cancellation = cancellation(&self.cancelled);
        response(unsafe { zp_waveform(path.as_ptr(), self.bins, &cancellation) })
    }
}

pub struct WaveformRangeJob {
    request: WaveformRangeRequest,
    cancelled: WaveformTicket,
}

impl WaveformRangeJob {
    pub fn execute(self) -> Result<Vec<u8>, String> {
        unsafe extern "C" fn allocate(context: *mut c_void, bytes: u32) -> *mut u8 {
            use crate::realtime::protocol_generated::{WAVEFORM_HEADER_BYTES, WAVEFORM_MAX_PAYLOAD_BYTES};
            let output = unsafe { &mut *context.cast::<Vec<u8>>() };
            let bytes = bytes as usize;
            if !output.is_empty() || bytes < WAVEFORM_HEADER_BYTES || bytes > WAVEFORM_HEADER_BYTES + WAVEFORM_MAX_PAYLOAD_BYTES
                || output.try_reserve_exact(bytes).is_err() { return std::ptr::null_mut(); }
            output.resize(bytes, 0);
            output.as_mut_ptr()
        }
        let path = CString::new(self.request.path).map_err(|error| error.to_string())?;
        let cancellation = cancellation(&self.cancelled);
        let mut output = Vec::<u8>::new();
        let mut error = std::ptr::null_mut();
        let success = unsafe { zp_waveform_range(path.as_ptr(), self.request.start_frame, self.request.frame_count, self.request.columns, self.request.frames_per_bin, &cancellation, (&mut output as *mut Vec<u8>).cast(), allocate, &mut error) };
        if success != 1 { return Err(if error.is_null() { "Native waveform failed without an error buffer".into() } else { take_buffer(error)? }); }
        if output.is_empty() { return Err("Native waveform returned no binary response".into()); }
        Ok(output)
    }
}

impl PlaybackService {
    pub fn prepare_waveform(&self, window: &str, path: String, bins: u32) -> Result<WaveformJob, String> {
        if !(1..=4096).contains(&bins) { return Err("Waveform bins must be between 1 and 4096".into()); }
        let cancelled = self.owner.waveform_windows.lock().map_err(|_| "Waveform window owner unavailable")?
            .prepare(window, WaveformKind::Overview)?;
        Ok(WaveformJob { path, bins, cancelled })
    }

    pub fn prepare_waveform_range(&self, window: &str, request: WaveformRangeRequest) -> Result<WaveformRangeJob, String> {
        request.validate()?;
        let cancelled = self.owner.waveform_windows.lock().map_err(|_| "Waveform window owner unavailable")?
            .prepare(window, WaveformKind::Range)?;
        Ok(WaveformRangeJob { request, cancelled })
    }

    pub fn cancel_waveform_ranges(&self, window: &str) -> Result<(), String> {
        self.owner.waveform_windows.lock().map_err(|_| "Waveform window owner unavailable")?.cancel_ranges(window)
    }

    pub fn close_waveform_window(&self, window: &str) -> Result<(), String> {
        self.owner.waveform_windows.lock().map_err(|_| "Waveform window owner unavailable")?.close(window);
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

    struct WaveformFixture(std::path::PathBuf);
    impl WaveformFixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("zoeydaw-waveform-{}-{}.wav", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
            let samples = [16384_i16, -16384, 8192, -8192, 16384, -16384, 8192, -8192];
            let bytes = (samples.len() * 2) as u32;
            let mut wav = Vec::new();
            wav.extend(b"RIFF");wav.extend((36 + bytes).to_le_bytes());wav.extend(b"WAVEfmt ");
            wav.extend(16_u32.to_le_bytes());wav.extend(1_u16.to_le_bytes());wav.extend(1_u16.to_le_bytes());
            wav.extend(48000_u32.to_le_bytes());wav.extend(96000_u32.to_le_bytes());wav.extend(2_u16.to_le_bytes());wav.extend(16_u16.to_le_bytes());
            wav.extend(b"data");wav.extend(bytes.to_le_bytes());
            for sample in samples { wav.extend(sample.to_le_bytes()); }
            std::fs::write(&path, wav).unwrap();Self(path)
        }
        fn request(&self) -> WaveformRangeRequest {
            serde_json::from_value(json!({"path":self.0,"startFrame":0,"frameCount":8,"columns":8,"framesPerBin":1})).unwrap()
        }
    }
    impl Drop for WaveformFixture {
        fn drop(&mut self) { let _ = std::fs::remove_file(&self.0); }
    }
    fn decoded_samples(bytes: &[u8]) -> Value {
        use crate::realtime::protocol_generated::*;
        let header = WireWaveformHeader::read(bytes).unwrap();
        assert_eq!((header.magic as usize, header.version as usize, header.header_bytes as usize), (WAVEFORM_MAGIC, WAVEFORM_VERSION, WAVEFORM_HEADER_BYTES));
        assert_eq!((header.kind as usize, header.channels, header.sample_rate, header.frames_per_bin), (WAVEFORM_KIND_SAMPLES, 1, 48000.0, 1));
        assert_eq!((header.total_frames, header.start_frame, header.frame_count, header.values_per_channel), (8, 0, 8, 8));
        assert_eq!(bytes.len(), WAVEFORM_HEADER_BYTES + header.payload_bytes as usize);
        json!(bytes[WAVEFORM_HEADER_BYTES..].chunks_exact(4).map(|chunk| f32::from_le_bytes(chunk.try_into().unwrap())).collect::<Vec<_>>())
    }

    #[test]
    fn independent_waveform_consumers_decode_their_own_samples() {
        let source = WaveformFixture::new();let service = PlaybackService::default();
        let first = service.prepare_waveform_range("first", source.request()).unwrap();
        let second = service.prepare_waveform_range("second", source.request()).unwrap();
        for job in [first, second] {
            let decoded = job.execute().expect("Another window must not cancel this decode");
            assert_eq!(decoded_samples(&decoded), json!([0.5,-0.5,0.25,-0.25,0.5,-0.5,0.25,-0.25]));
        }
    }

    #[test]
    fn waveform_window_cancel_close_and_owner_drop_stop_only_owned_jobs() {
        let source = WaveformFixture::new();let service = PlaybackService::default();
        let overview = service.prepare_waveform("first", source.0.to_string_lossy().into_owned(), 1).unwrap();
        let range = service.prepare_waveform_range("first", source.request()).unwrap();
        let other = service.prepare_waveform_range("second", source.request()).unwrap();
        service.cancel_waveform_ranges("first").unwrap();
        assert!(range.execute().unwrap_err().contains("cancelled"));
        assert_eq!(overview.execute().unwrap()["peaks"], json!([0.5]));
        assert_eq!(decoded_samples(&other.execute().unwrap())[1], json!(-0.5));

        let overview = service.prepare_waveform("first", source.0.to_string_lossy().into_owned(), 1).unwrap();
        let range = service.prepare_waveform_range("first", source.request()).unwrap();
        let other = service.prepare_waveform_range("second", source.request()).unwrap();
        service.close_waveform_window("first").unwrap();
        assert!(overview.execute().unwrap_err().contains("cancelled"));
        assert!(range.execute().unwrap_err().contains("cancelled"));
        assert!(service.prepare_waveform_range("first", source.request()).is_err());
        assert!(service.prepare_waveform("first", source.0.to_string_lossy().into_owned(), 1).is_err());
        assert_eq!(decoded_samples(&other.execute().unwrap())[2], json!(0.25));

        let pending = service.prepare_waveform_range("second", source.request()).unwrap();
        drop(service);
        assert!(pending.execute().unwrap_err().contains("cancelled"));
    }

    #[test]
    fn newer_window_demand_cancels_its_previous_job_but_invalid_input_does_not() {
        let source = WaveformFixture::new();let service = PlaybackService::default();
        let previous = service.prepare_waveform_range("first", source.request()).unwrap();
        let mut invalid = source.request();invalid.columns = 0;
        assert!(service.prepare_waveform_range("first", invalid).is_err());
        assert_eq!(decoded_samples(&previous.execute().unwrap())[3], json!(-0.25));
        let previous = service.prepare_waveform_range("first", source.request()).unwrap();
        let other = service.prepare_waveform_range("second", source.request()).unwrap();
        let current = service.prepare_waveform_range("first", source.request()).unwrap();
        assert!(previous.execute().unwrap_err().contains("cancelled"));
        assert_eq!(decoded_samples(&current.execute().unwrap())[4], json!(0.5));
        assert_eq!(decoded_samples(&other.execute().unwrap())[5], json!(-0.5));
    }

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
