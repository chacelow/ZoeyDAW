//! Hardware input-channel meters on their own cpal input stream.
//!
//! Input never shares the playback graph: firewheel-cpal sizes its input buffer by the
//! requested block while WASAPI shared mode can deliver larger callbacks, which panics the
//! audio thread. A separate stream measures exactly the frames each callback delivers.

use crate::{defaults::TELEMETRY_FLOOR_DB, protocol::BackendMeterLevels, realtime::amplitude_db};
use firewheel::cpal::cpal::{
    self,
    traits::{DeviceTrait, HostTrait, StreamTrait},
};
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicU32, AtomicU64, AtomicUsize, Ordering},
        Arc,
    },
};

/// Physical channels metered; the routing chooser offers channel pairs 1-2 and 3-4.
const METERED_CHANNELS: usize = 4;

/// Input choices exposed by the routing chooser, mapped to physical channel indices.
const CHANNEL_IDS: [(&str, usize, usize); 4] = [("1-2", 0, 1), ("3-4", 2, 3), ("1", 0, 0), ("2", 1, 1)];

struct ChannelMeter {
    peak: AtomicU32,
    rms: AtomicU32,
}

/// Seqlock-published peak and RMS per physical input channel.
pub(crate) struct InputSnapshot {
    version: AtomicU64,
    channels: AtomicUsize,
    meters: [ChannelMeter; METERED_CHANNELS],
}

impl InputSnapshot {
    pub fn new() -> Self {
        Self {
            version: AtomicU64::new(0),
            channels: AtomicUsize::new(0),
            meters: std::array::from_fn(|_| ChannelMeter {
                peak: AtomicU32::new(0),
                rms: AtomicU32::new(0),
            }),
        }
    }

    /// Meters one interleaved callback of any length. Never allocates.
    pub fn publish(&self, interleaved: &[f32], channels: usize) {
        if channels == 0 {
            return;
        }
        let frames = interleaved.len() / channels;
        self.version.fetch_add(1, Ordering::AcqRel);
        self.channels.store(channels, Ordering::Relaxed);
        for (index, meter) in self.meters.iter().enumerate().take(channels) {
            let mut peak = 0.0_f32;
            let mut sum = 0.0_f64;
            for frame in 0..frames {
                let sample = interleaved[frame * channels + index];
                let sample = if sample.is_finite() { sample.abs() } else { 0.0 };
                peak = peak.max(sample);
                sum += f64::from(sample) * f64::from(sample);
            }
            let rms = if frames == 0 { 0.0 } else { (sum / frames as f64).sqrt() as f32 };
            meter.peak.store(peak.to_bits(), Ordering::Relaxed);
            meter.rms.store(rms.to_bits(), Ordering::Relaxed);
        }
        self.version.fetch_add(1, Ordering::Release);
    }

    /// Levels keyed by routing chooser id; empty until the first callback or while publishing.
    pub fn levels(&self) -> BTreeMap<String, BackendMeterLevels> {
        let before = self.version.load(Ordering::Acquire);
        let channels = self.channels.load(Ordering::Relaxed);
        if before == 0 || before & 1 != 0 || channels == 0 {
            return BTreeMap::new();
        }
        let read = |index: usize| -> [f64; 2] {
            match self.meters.get(index) {
                Some(meter) if index < channels => [
                    amplitude_db(f32::from_bits(meter.peak.load(Ordering::Relaxed))),
                    amplitude_db(f32::from_bits(meter.rms.load(Ordering::Relaxed))),
                ],
                _ => [TELEMETRY_FLOOR_DB; 2],
            }
        };
        let levels = CHANNEL_IDS
            .iter()
            .map(|&(id, left, right)| {
                let (left, right) = (read(left), read(right));
                (id.to_owned(), BackendMeterLevels { peak: [left[0], right[0]], rms: [left[1], right[1]] })
            })
            .collect();
        std::sync::atomic::fence(Ordering::Acquire);
        if self.version.load(Ordering::Relaxed) == before { levels } else { BTreeMap::new() }
    }
}

/// The running input stream. Dropping it stops metering.
pub(crate) struct InputMeter {
    _stream: cpal::Stream,
    snapshot: Arc<InputSnapshot>,
}

impl InputMeter {
    /// Best effort: no device, a denied permission or an unsupported format returns the reason
    /// and playback continues without input meters.
    pub fn open() -> Result<Self, String> {
        let device = cpal::default_host()
            .default_input_device()
            .ok_or_else(|| "no default input device".to_owned())?;
        let supported = device.default_input_config().map_err(|e| e.to_string())?;
        let format = supported.sample_format();
        let config: cpal::StreamConfig = supported.into();
        let channels = usize::from(config.channels);
        let snapshot = Arc::new(InputSnapshot::new());
        let sink = snapshot.clone();
        // A capture discontinuity drops one packet; the next callback's peak and RMS are still
        // correct, so only errors that stop metering are reported.
        let error = |error: cpal::Error| {
            if error.kind() != cpal::ErrorKind::Xrun {
                eprintln!("zoeydaw input meter stream error: {error}");
            }
        };
        let stream = match format {
            cpal::SampleFormat::F32 => device.build_input_stream(
                config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| sink.publish(data, channels),
                error,
                None,
            ),
            cpal::SampleFormat::I16 => {
                let mut scratch = Vec::new();
                device.build_input_stream(
                    config,
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        convert(&mut scratch, data, |s| f32::from(s) / f32::from(i16::MAX));
                        sink.publish(&scratch, channels);
                    },
                    error,
                    None,
                )
            }
            cpal::SampleFormat::I32 => {
                let mut scratch = Vec::new();
                device.build_input_stream(
                    config,
                    move |data: &[i32], _: &cpal::InputCallbackInfo| {
                        convert(&mut scratch, data, |s| s as f32 / i32::MAX as f32);
                        sink.publish(&scratch, channels);
                    },
                    error,
                    None,
                )
            }
            other => return Err(format!("unsupported input sample format {other:?}")),
        }
        .map_err(|e| e.to_string())?;
        stream.play().map_err(|e| e.to_string())?;
        Ok(Self { _stream: stream, snapshot })
    }

    pub fn levels(&self) -> BTreeMap<String, BackendMeterLevels> {
        self.snapshot.levels()
    }
}

/// Converts into a scratch buffer that grows only when a callback is larger than any before.
fn convert<T: Copy>(scratch: &mut Vec<f32>, data: &[T], to_f32: impl Fn(T) -> f32) {
    scratch.clear();
    scratch.extend(data.iter().map(|&sample| to_f32(sample)));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_channel_pairs_and_silences_missing_channels() {
        let snapshot = InputSnapshot::new();
        assert!(snapshot.levels().is_empty());
        // Three channels, two frames, interleaved.
        snapshot.publish(&[0.5, 0.25, 1.0, -0.5, -0.25, -1.0], 3);
        let levels = snapshot.levels();
        assert_eq!(levels["1-2"].peak, [amplitude_db(0.5), amplitude_db(0.25)]);
        assert_eq!(levels["1"].peak, [amplitude_db(0.5), amplitude_db(0.5)]);
        assert_eq!(levels["2"].peak, [amplitude_db(0.25), amplitude_db(0.25)]);
        assert_eq!(levels["3-4"].peak, [amplitude_db(1.0), TELEMETRY_FLOOR_DB]);
        assert_eq!(levels["3-4"].rms, [amplitude_db(1.0), TELEMETRY_FLOOR_DB]);
    }

    #[test]
    fn meters_callbacks_of_any_length_without_a_fixed_block() {
        let snapshot = InputSnapshot::new();
        for frames in [64, 1056, 4096, 1] {
            let data = vec![0.5_f32; frames * 2];
            snapshot.publish(&data, 2);
            assert_eq!(snapshot.levels()["1-2"].peak, [amplitude_db(0.5); 2]);
        }
        // A trailing partial frame is ignored rather than read past the end.
        snapshot.publish(&[0.25, 0.25, 0.9], 2);
        assert_eq!(snapshot.levels()["1-2"].peak, [amplitude_db(0.25); 2]);
    }
}
