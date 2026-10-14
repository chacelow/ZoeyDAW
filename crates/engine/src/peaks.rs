//! Per-channel waveform envelopes; PCM never leaves the precomputation boundary.

use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelPeaks {
    pub min: Vec<f32>,
    pub max: Vec<f32>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeakLevel {
    pub frames_per_bin: u32,
    pub channels: Vec<ChannelPeaks>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeakPyramid {
    levels: Vec<PeakLevel>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PeakBin {
    pub channel: usize,
    pub index: usize,
    pub min: f32,
    pub max: f32,
}

impl PeakPyramid {
    /// Builds at least one level, even for empty input or `levels == 0`.
    /// A zero base size is normalized to one frame. Unequal channel lengths
    /// retain their individual final bins; no samples are synthesized. NaNs
    /// become zero. Higher levels stop before a u32 bin-size overflow.
    pub fn build(channels: &[&[f32]], base_frames_per_bin: u32, levels: usize) -> Self {
        let frames_per_bin = base_frames_per_bin.max(1);
        let channels = channels
            .iter()
            .map(|samples| channel_peaks(samples.len(), frames_per_bin, |frame| samples[frame]))
            .collect();
        Self::from_base(
            PeakLevel {
                frames_per_bin,
                channels,
            },
            levels,
        )
    }

    /// `channels` must be nonzero. A trailing incomplete interleaved frame is
    /// retained: each channel keeps only its actual samples, without padding.
    pub fn from_interleaved(
        samples: &[f32],
        channels: usize,
        base_frames_per_bin: u32,
        levels: usize,
    ) -> Self {
        assert!(
            channels > 0,
            "interleaved PCM requires at least one channel"
        );
        let frames_per_bin = base_frames_per_bin.max(1);
        let channels = (0..channels)
            .map(|channel| {
                let length =
                    samples.len() / channels + usize::from(channel < samples.len() % channels);
                channel_peaks(length, frames_per_bin, |frame| {
                    samples[frame * channels + channel]
                })
            })
            .collect();
        Self::from_base(
            PeakLevel {
                frames_per_bin,
                channels,
            },
            levels,
        )
    }

    fn from_base(base: PeakLevel, requested_levels: usize) -> Self {
        let mut levels = vec![base];
        while levels.len() < requested_levels {
            let previous = levels.last().expect("base level always exists");
            let Some(frames_per_bin) = previous.frames_per_bin.checked_mul(2) else {
                break;
            };
            let channels = previous
                .channels
                .iter()
                .map(|channel| {
                    let mut min = Vec::with_capacity(channel.min.len().div_ceil(2));
                    let mut max = Vec::with_capacity(channel.max.len().div_ceil(2));
                    for (mins, maxs) in channel.min.chunks(2).zip(channel.max.chunks(2)) {
                        min.push(if mins.len() == 2 {
                            mins[0].min(mins[1])
                        } else {
                            mins[0]
                        });
                        max.push(if maxs.len() == 2 {
                            maxs[0].max(maxs[1])
                        } else {
                            maxs[0]
                        });
                    }
                    ChannelPeaks { min, max }
                })
                .collect();
            levels.push(PeakLevel {
                frames_per_bin,
                channels,
            });
        }
        Self { levels }
    }

    pub fn levels(&self) -> &[PeakLevel] {
        &self.levels
    }

    pub fn level_for(&self, frames_per_pixel: f64) -> &PeakLevel {
        self.levels
            .iter()
            .rev()
            .find(|level| f64::from(level.frames_per_bin) <= frames_per_pixel)
            .unwrap_or(&self.levels[0])
    }

    /// Yields channel-major bins intersecting the half-open visible frame
    /// range. The edge bins are retained whole. Missing levels, reversed or
    /// empty ranges yield no bins; channel lengths bound cropping independently.
    pub fn range(
        &self,
        level: usize,
        start_frame: u64,
        end_frame: u64,
    ) -> impl Iterator<Item = PeakBin> + '_ {
        self.levels.get(level).into_iter().flat_map(move |level| {
            let size = u64::from(level.frames_per_bin);
            let start = start_frame / size;
            let end = if end_frame > start_frame {
                end_frame.div_ceil(size)
            } else {
                start
            };
            level
                .channels
                .iter()
                .enumerate()
                .flat_map(move |(channel, peaks)| {
                    let start = start.min(peaks.min.len() as u64) as usize;
                    let end = end.min(peaks.min.len() as u64) as usize;
                    (start..end).map(move |index| PeakBin {
                        channel,
                        index,
                        min: peaks.min[index],
                        max: peaks.max[index],
                    })
                })
        })
    }

    /// Exact channel-major pixel envelopes. PCM supplies only partial edge bins;
    /// aligned interiors use the pyramid without requiring a frame-sized base level.
    pub fn read_pixels(
        &self,
        start: u64,
        end: u64,
        pixels: usize,
        frames: usize,
        sample_at: impl Fn(usize, usize) -> f32,
    ) -> Result<Vec<f32>, &'static str> {
        if pixels == 0 || pixels > 16384 || end <= start {
            return Err("invalid peak range or pixel count");
        }
        let width = u64::from(self.levels[0].frames_per_bin);
        let mut output = Vec::with_capacity(self.levels[0].channels.len() * pixels * 2);
        for (channel, base) in self.levels[0].channels.iter().enumerate() {
            let end = end.min(frames as u64).min(base.min.len() as u64 * width);
            let start = start.min(end);
            for pixel in 0..pixels {
                let mut frame = start + ((end - start) as u128 * pixel as u128 / pixels as u128) as u64;
                let boundary = start + ((end - start) as u128 * (pixel + 1) as u128 / pixels as u128) as u64;
                let mut low = f32::INFINITY;
                let mut high = f32::NEG_INFINITY;
                while frame < boundary {
                    if frame % width != 0 || boundary - frame < width {
                        let sample = sample_at(channel, frame as usize);
                        let sample = if sample.is_nan() { 0.0 } else { sample };
                        low = low.min(sample);
                        high = high.max(sample);
                        frame += 1;
                        continue;
                    }
                    let units = frame / width;
                    let alignment = if units == 0 { 63 } else { units.trailing_zeros() as usize };
                    let size = (63 - ((boundary - frame) / width).leading_zeros()) as usize;
                    let level = &self.levels[alignment.min(size).min(self.levels.len() - 1)];
                    let index = (frame / u64::from(level.frames_per_bin)) as usize;
                    low = low.min(level.channels[channel].min[index]);
                    high = high.max(level.channels[channel].max[index]);
                    frame += u64::from(level.frames_per_bin);
                }
                let envelope = if low.is_infinite() { [0.0, 0.0] } else { [low, high] };
                output.extend_from_slice(&envelope);
            }
        }
        Ok(output)
    }
}

fn channel_peaks(
    length: usize,
    frames_per_bin: u32,
    sample_at: impl Fn(usize) -> f32,
) -> ChannelPeaks {
    let size = frames_per_bin as usize;
    let bins = length.div_ceil(size);
    let mut min = Vec::with_capacity(bins);
    let mut max = Vec::with_capacity(bins);
    for start in (0..length).step_by(size) {
        let mut low = f32::INFINITY;
        let mut high = f32::NEG_INFINITY;
        for frame in start..start.saturating_add(size).min(length) {
            let sample = sample_at(frame);
            let sample = if sample.is_nan() { 0.0 } else { sample };
            low = low.min(sample);
            high = high.max(sample);
        }
        min.push(low);
        max.push(high);
    }
    ChannelPeaks { min, max }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sine_wave_pyramid() {
        let samples: Vec<f32> = (0..4800)
            .map(|frame| {
                (0.5 * (std::f64::consts::TAU * 1000.0 * f64::from(frame) / 48000.0).sin()) as f32
            })
            .collect();
        let pyramid = PeakPyramid::build(&[&samples], 480, 5);
        let base = &pyramid.levels()[0].channels[0];
        println!(
            "sine-wave pyramid: level count = {}",
            pyramid.levels().len()
        );
        for bin in 0..3 {
            println!(
                "level 0 bin {bin}: min = {:.6}, max = {:.6}",
                base.min[bin], base.max[bin]
            );
        }
        assert_eq!(base.min.len(), 10);
        for (&min, &max) in base.min.iter().zip(&base.max) {
            assert!((min + 0.5).abs() < 1e-3);
            assert!((max - 0.5).abs() < 1e-3);
            assert!((max + min).abs() < 2e-3);
        }
        for level in pyramid.levels() {
            for (&min, &max) in level.channels[0].min.iter().zip(&level.channels[0].max) {
                assert_eq!(min, base.min[0]);
                assert_eq!(max, base.max[0]);
            }
        }
    }

    #[test]
    fn ramp_and_partial_non_power_of_two_bins() {
        let samples: Vec<f32> = (0..17).map(|frame| frame as f32 - 8.0).collect();
        let pyramid = PeakPyramid::build(&[&samples], 3, 5);
        for level in pyramid.levels() {
            let size = level.frames_per_bin as usize;
            let channel = &level.channels[0];
            assert_eq!(channel.min.len(), samples.len().div_ceil(size));
            assert_eq!(channel.max.len(), channel.min.len());
            for (bin, (&min, &max)) in channel.min.iter().zip(&channel.max).enumerate() {
                assert_eq!(min, samples[bin * size]);
                assert_eq!(max, samples[((bin + 1) * size).min(samples.len()) - 1]);
            }
        }
        assert_eq!(
            pyramid.levels()[0].channels[0].min,
            [-8.0, -5.0, -2.0, 1.0, 4.0, 7.0]
        );
    }

    #[test]
    fn silence_empty_and_nan_samples() {
        let silence = [0.0; 13];
        let pyramid = PeakPyramid::build(&[&silence], 4, 4);
        for level in pyramid.levels() {
            assert!(level.channels[0]
                .min
                .iter()
                .chain(&level.channels[0].max)
                .all(|&v| v == 0.0));
        }
        let nan = PeakPyramid::build(&[&[f32::NAN, -1.0, f32::NAN, 2.0]], 2, 2);
        assert_eq!(nan.levels()[0].channels[0].min, [-1.0, 0.0]);
        assert_eq!(nan.levels()[0].channels[0].max, [0.0, 2.0]);
        let empty = PeakPyramid::build(&[&[]], 4, 3);
        assert_eq!(empty.levels().len(), 3);
        assert!(empty
            .levels()
            .iter()
            .all(|level| level.channels[0].min.is_empty()));
        assert_eq!(empty.range(0, 0, 100).count(), 0);
        let no_channels = PeakPyramid::build(&[], 0, 0);
        assert_eq!(no_channels.levels().len(), 1);
        assert_eq!(no_channels.level_for(0.0).frames_per_bin, 1);
        assert!(no_channels.levels()[0].channels.is_empty());
    }

    #[test]
    fn stereo_and_interleaved_preserve_distinct_channels() {
        let left = [-1.0, 0.5, 0.3, -0.1, 0.8];
        let right = [0.1, 0.2, -0.7, 0.9, -0.2];
        let planar = PeakPyramid::build(&[&left, &right], 2, 3);
        let interleaved: Vec<f32> = left.iter().zip(right).flat_map(|(&l, r)| [l, r]).collect();
        assert_eq!(PeakPyramid::from_interleaved(&interleaved, 2, 2, 3), planar);
        assert_eq!(planar.levels()[0].channels[0].min, [-1.0, -0.1, 0.8]);
        assert_eq!(planar.levels()[0].channels[1].min, [0.1, -0.7, -0.2]);
        let short = PeakPyramid::from_interleaved(&[1.0, 2.0, 3.0], 2, 1, 2);
        assert_eq!(short.levels()[0].channels[0].min, [1.0, 3.0]);
        assert_eq!(short.levels()[0].channels[1].min, [2.0]);
    }

    #[test]
    fn parent_bins_equal_children_for_deterministic_signal() {
        let mut state = 0x1234_5678_u32;
        let samples: Vec<f32> = (0..1031)
            .map(|_| {
                state = state.wrapping_mul(1664525).wrapping_add(1013904223);
                (state >> 8) as f32 / 16777216.0 * 2.0 - 1.0
            })
            .collect();
        let pyramid = PeakPyramid::build(&[&samples], 7, 10);
        for levels in pyramid.levels().windows(2) {
            let child = &levels[0].channels[0];
            let parent = &levels[1].channels[0];
            for bin in 0..parent.min.len() {
                let a = bin * 2;
                let b = (a + 1).min(child.min.len() - 1);
                assert_eq!(parent.min[bin], child.min[a].min(child.min[b]));
                assert_eq!(parent.max[bin], child.max[a].max(child.max[b]));
            }
        }
    }

    #[test]
    fn level_selection_cropping_and_json_serialization() {
        let pyramid = PeakPyramid::build(&[&[0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0]], 2, 3);
        for (requested, expected) in [
            (0.0, 2),
            (1.0, 2),
            (3.9, 2),
            (4.0, 4),
            (100.0, 8),
            (f64::NAN, 2),
        ] {
            assert_eq!(pyramid.level_for(requested).frames_per_bin, expected);
        }
        let bins: Vec<_> = pyramid.range(0, 3, 5).collect();
        assert_eq!(
            bins,
            [
                PeakBin {
                    channel: 0,
                    index: 1,
                    min: 2.0,
                    max: 3.0
                },
                PeakBin {
                    channel: 0,
                    index: 2,
                    min: 4.0,
                    max: 5.0
                }
            ]
        );
        assert_eq!(pyramid.range(0, 2, 4).count(), 1);
        assert_eq!(pyramid.range(0, 5, 5).count(), 0);
        assert_eq!(pyramid.range(0, 5, 3).count(), 0);
        assert_eq!(pyramid.range(0, 100, u64::MAX).count(), 0);
        assert_eq!(pyramid.range(1, 0, u64::MAX).count(), 2);
        assert_eq!(pyramid.range(99, 0, 100).count(), 0);
        let json = serde_json::to_value(&pyramid).unwrap();
        assert_eq!(json["levels"][0]["framesPerBin"], 2);
        assert_eq!(
            json["levels"][0]["channels"][0]["min"],
            serde_json::json!([0.0, 2.0, 4.0, 6.0])
        );
    }

    #[test]
    fn bin_size_overflow_stops_without_corrupting_resolution() {
        let pyramid = PeakPyramid::build(&[&[1.0]], u32::MAX, 10);
        assert_eq!(pyramid.levels().len(), 1);
        assert_eq!(pyramid.level_for(f64::INFINITY).frames_per_bin, u32::MAX);
    }
}
