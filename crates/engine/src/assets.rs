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

#[derive(Debug)]
pub struct AudioSource {
    pub pcm: Vec<[f32; 2]>,
    pub sample_rate: u32,
    pub peaks: PeakPyramid,
}

impl AudioSource {
    pub fn from_pcm(pcm: Vec<[f32; 2]>, sample_rate: u32) -> Self {
        let peaks = PeakPyramid::from_interleaved(pcm.as_flattened(), 2, 64, 32);
        Self {
            pcm,
            sample_rate,
            peaks,
        }
    }

    pub fn read_peaks(
        &self,
        start: u64,
        end: u64,
        pixels: usize,
    ) -> Result<Vec<f32>, &'static str> {
        self.peaks
            .read_pixels(start, end, pixels, self.pcm.len(), |channel, frame| {
                self.pcm[frame][channel]
            })
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
        Ok(Self::from_pcm(pcm, target_rate))
    }
}
