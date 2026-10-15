//! Blocking decoding/resampling belongs to the session control thread, never to the audio callback.
use crate::peaks::PeakPyramid;
use audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Resampler};
use std::{fs::File, path::Path};
use symphonia::core::{
    codecs::audio::AudioDecoderOptions,
    formats::{probe::Hint, TrackType},
    io::MediaSourceStream,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SourceInfo {
    pub sample_rate: u32,
    pub frames: u64,
    pub channels: u32,
}

/// Matches the `PeakPyramid::read_pixels` limit; callers reject larger requests
/// before allocating output.
pub const MAX_PEAK_PIXELS: usize = 16384;

/// `pcm` is the only PCM buffer, resampled to the device rate for playback.
/// `peaks` stays in the decoded source frame domain described by `source_info`.
#[derive(Debug)]
pub struct AudioSource {
    pub pcm: Vec<[f32; 2]>,
    pub sample_rate: u32,
    pub peaks: PeakPyramid,
    pub source_info: SourceInfo,
}

impl AudioSource {
    pub fn from_pcm(pcm: Vec<[f32; 2]>, sample_rate: u32) -> Self {
        let peaks = PeakPyramid::from_interleaved(pcm.as_flattened(), 2, 64, 32);
        let source_info = SourceInfo {
            sample_rate,
            frames: pcm.len() as u64,
            channels: 2,
        };
        Self {
            pcm,
            sample_rate,
            peaks,
            source_info,
        }
    }

    /// Source-frame envelopes. Pyramid bins cover the interior; partial edge
    /// bins sample `pcm` at the device frame that starts at the source frame,
    /// clamped to the last one, which is exact when the rates match.
    pub fn read_peaks(
        &self,
        start: u64,
        end: u64,
        pixels: usize,
    ) -> Result<Vec<f32>, &'static str> {
        let source_rate = u128::from(self.source_info.sample_rate.max(1));
        let device_rate = u128::from(self.sample_rate);
        let last = self.pcm.len().saturating_sub(1);
        self.peaks.read_pixels(
            start,
            end,
            pixels,
            self.source_info.frames as usize,
            |channel, frame| {
                let device_frame = (frame as u128 * device_rate / source_rate) as usize;
                self.pcm
                    .get(device_frame.min(last))
                    .map_or(0.0, |pcm| pcm[channel])
            },
        )
    }

    /// `span` source frames from `start`, wrapping at the source end exactly
    /// like looped playback. Pixel boundaries and layout match `read_peaks`,
    /// so a span that never wraps yields the same envelopes.
    pub fn read_looped_peaks(
        &self,
        start: u64,
        span: u64,
        pixels: usize,
    ) -> Result<Vec<f32>, &'static str> {
        let frames = self.source_info.frames;
        if frames == 0 || span == 0 || pixels == 0 || pixels > MAX_PEAK_PIXELS {
            return Err("invalid looped peak range or pixel count");
        }
        let start = start % frames;
        if span <= frames - start {
            return self.read_peaks(start, start + span, pixels);
        }
        let channels = self.peaks.levels()[0].channels.len();
        let mut output = vec![0.0; channels * pixels * 2];
        for pixel in 0..pixels {
            let from = (u128::from(span) * pixel as u128 / pixels as u128) as u64;
            let to = (u128::from(span) * (pixel as u128 + 1) / pixels as u128) as u64;
            if from == to {
                continue;
            }
            let first = (start + from % frames) % frames;
            let last = first + (to - from).min(frames);
            let mut envelope = [[f32::INFINITY, f32::NEG_INFINITY]; 2];
            for (from, to) in [(first, last.min(frames)), (0, last.saturating_sub(frames))] {
                if from >= to {
                    continue;
                }
                let bins = self.read_peaks(from, to, 1)?;
                for (channel, bounds) in envelope.iter_mut().enumerate().take(channels) {
                    bounds[0] = bounds[0].min(bins[channel * 2]);
                    bounds[1] = bounds[1].max(bins[channel * 2 + 1]);
                }
            }
            for (channel, bounds) in envelope.iter().enumerate().take(channels) {
                let at = (channel * pixels + pixel) * 2;
                output[at..at + 2].copy_from_slice(bounds);
            }
        }
        Ok(output)
    }

    pub fn decode(path: &Path, target_rate: u32) -> Result<Self, String> {
        let stream = MediaSourceStream::new(
            Box::new(File::open(path).map_err(|e| e.to_string())?),
            Default::default(),
        );
        let mut hint = Hint::new();
        if let Some(extension) = path.extension().and_then(|s| s.to_str()) {
            hint.with_extension(extension);
        }
        let mut format = symphonia::default::get_probe()
            .probe(&hint, stream, Default::default(), Default::default())
            .map_err(|e| e.to_string())?;
        let track = format
            .default_track(TrackType::Audio)
            .ok_or("no audio track")?;
        let params = track
            .codec_params
            .as_ref()
            .and_then(|p| p.audio())
            .ok_or("missing audio codec parameters")?;
        let mut decoder = symphonia::default::get_codecs()
            .make_audio_decoder(params, &AudioDecoderOptions::default())
            .map_err(|e| e.to_string())?;
        let track_id = track.id;
        let mut rate = 0;
        let mut channels = 0;
        let mut interleaved = Vec::new();
        let mut packet_samples = Vec::<f32>::new();
        while let Some(packet) = format.next_packet().map_err(|e| e.to_string())? {
            if packet.track_id != track_id {
                continue;
            }
            let decoded = decoder.decode(&packet).map_err(|e| e.to_string())?;
            let spec = decoded.spec();
            if rate != 0 && (rate != spec.rate() || channels != spec.channels().count()) {
                return Err("source format changed while decoding".into());
            }
            rate = spec.rate();
            channels = spec.channels().count();
            if !(1..=2).contains(&channels) {
                return Err("only mono/stereo media is supported".into());
            }
            packet_samples.resize(decoded.samples_interleaved(), 0.0);
            decoded.copy_to_slice_interleaved(&mut packet_samples);
            if packet_samples.iter().any(|sample| !sample.is_finite()) {
                return Err("non-finite PCM".into());
            }
            interleaved.extend_from_slice(&packet_samples);
        }
        if rate == 0 || target_rate == 0 {
            return Err("empty media or invalid sample rate".into());
        }
        let source_info = SourceInfo {
            sample_rate: rate,
            frames: (interleaved.len() / channels) as u64,
            channels: channels as u32,
        };
        let peaks = if channels == 1 {
            PeakPyramid::build(&[&interleaved, &interleaved], 64, 32)
        } else {
            PeakPyramid::from_interleaved(&interleaved, channels, 64, 32)
        };
        if rate != target_rate {
            let frames = interleaved.len() / channels;
            let input =
                InterleavedSlice::new(&interleaved, channels, frames).map_err(|e| e.to_string())?;
            let mut resampler = Fft::<f32>::new(
                rate as usize,
                target_rate as usize,
                1024,
                channels,
                FixedSync::Both,
            )
            .map_err(|e| e.to_string())?;
            interleaved = resampler
                .process_all(&input, frames, None)
                .map_err(|e| e.to_string())?
                .take_data();
        }
        let pcm = interleaved
            .chunks_exact(channels)
            .map(|frame| [frame[0], frame[channels - 1]])
            .collect();
        Ok(Self {
            pcm,
            sample_rate: target_rate,
            peaks,
            source_info,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mono_wav(name: &str, rate: u32, samples: &[i16]) -> std::path::PathBuf {
        let mut bytes = Vec::with_capacity(44 + samples.len() * 2);
        let data = (samples.len() * 2) as u32;
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        for field in [16u32, 1 | (1 << 16), rate, rate * 2, 2 | (16 << 16)] {
            bytes.extend_from_slice(&field.to_le_bytes());
        }
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data.to_le_bytes());
        samples
            .iter()
            .for_each(|s| bytes.extend_from_slice(&s.to_le_bytes()));
        let path = std::env::temp_dir().join(format!(
            "zoeydaw-assets-{name}-{rate}-{}.wav",
            std::process::id()
        ));
        std::fs::write(&path, bytes).unwrap();
        path
    }

    #[test]
    fn from_pcm_preserves_source_info() {
        let pcm = vec![[0.1, -0.1], [0.5, -0.5], [-0.8, 0.8]];
        let source = AudioSource::from_pcm(pcm, 44100);
        assert_eq!(source.source_info.sample_rate, 44100);
        assert_eq!(source.source_info.frames, 3);
        assert_eq!(source.source_info.channels, 2);
        let peaks = source.read_peaks(0, 3, 3).unwrap();
        assert_eq!(peaks.len(), 12);
    }

    #[test]
    fn decode_keeps_one_device_rate_pcm_and_source_rate_info() {
        let path = mono_wav("single-pcm", 44100, &[0; 44100]);
        let decoded = AudioSource::decode(&path, 48000);
        std::fs::remove_file(&path).unwrap();
        // Exhaustive destructuring: a second PCM field fails to compile here.
        let AudioSource {
            pcm,
            sample_rate,
            peaks: _,
            source_info,
        } = decoded.unwrap();
        assert_eq!(sample_rate, 48000);
        assert_eq!(
            source_info,
            SourceInfo {
                sample_rate: 44100,
                frames: 44100,
                channels: 1
            }
        );
        assert!(pcm.len().abs_diff(48000) <= 1024, "{}", pcm.len());
        assert_eq!(pcm.capacity(), pcm.len());
    }

    #[test]
    fn peaks_address_source_frames_not_device_frames() {
        let mut samples = vec![0i16; 44100];
        samples[30000] = i16::MAX;
        let path = mono_wav("spike", 44100, &samples);
        let source = AudioSource::decode(&path, 48000).unwrap();
        std::fs::remove_file(&path).unwrap();
        let hit = source.read_peaks(29952, 30016, 1).unwrap();
        assert!(hit[1] > 0.9 && hit[3] > 0.9, "{hit:?}");
        // The spike sits at device frame 32653; a device-domain read would hit here.
        let miss = source.read_peaks(32576, 32704, 1).unwrap();
        assert!(miss[1] < 0.01, "{miss:?}");
    }

    #[test]
    fn looped_peaks_wrap_at_the_source_end() {
        let pcm: Vec<_> = (0..1000).map(|i| [i as f32, -(i as f32)]).collect();
        let source = AudioSource::from_pcm(pcm.clone(), 48000);
        let brute = |start: u64, span: u64, pixels: usize| {
            let mut out = vec![0.0; pixels * 4];
            for pixel in 0..pixels {
                let from = span * pixel as u64 / pixels as u64;
                let to = span * (pixel as u64 + 1) / pixels as u64;
                if from == to {
                    continue;
                }
                let mut envelope = [[f32::INFINITY, f32::NEG_INFINITY]; 2];
                for frame in from..to {
                    let sample = pcm[((start + frame) % 1000) as usize];
                    for (bounds, value) in envelope.iter_mut().zip(sample) {
                        *bounds = [bounds[0].min(value), bounds[1].max(value)];
                    }
                }
                for (channel, bounds) in envelope.iter().enumerate() {
                    let at = (channel * pixels + pixel) * 2;
                    out[at..at + 2].copy_from_slice(bounds);
                }
            }
            out
        };
        for (start, span, pixels) in [
            (0, 1000, 10),
            (900, 200, 4),
            (999, 1, 1),
            (1500, 3000, 7),
            (10, 990, 3),
            (250, 2500, 5000),
        ] {
            assert_eq!(
                source.read_looped_peaks(start, span, pixels).unwrap(),
                brute(start, span, pixels),
                "start {start} span {span} pixels {pixels}"
            );
        }
        assert!(source.read_looped_peaks(0, 0, 4).is_err());
        assert!(source
            .read_looped_peaks(0, 10, MAX_PEAK_PIXELS + 1)
            .is_err());
    }
}
