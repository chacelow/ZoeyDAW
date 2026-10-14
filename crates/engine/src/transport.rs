//! One-based musical bars backed by an integer sample clock.

use std::ops::Range;

use crate::protocol::{BackendClock, BackendControl, BackendProject};

/// `sample_rate` and `bars_per_second` must be positive; the latter must be finite.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TransportClock {
    pub sample_rate: u32,
    pub bars_per_second: f64,
}

impl TransportClock {
    pub fn new(sample_rate: u32, bars_per_second: f64) -> Option<Self> {
        (sample_rate > 0 && bars_per_second.is_finite() && bars_per_second > 0.0).then_some(Self {
            sample_rate,
            bars_per_second,
        })
    }
}

/// Half-open source-frame interval. Construction guarantees a nonzero length.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LoopRegion {
    start_frame: u64,
    end_frame: u64,
}

impl LoopRegion {
    pub fn new(start_frame: u64, end_frame: u64) -> Option<Self> {
        (end_frame > start_frame).then_some(Self {
            start_frame,
            end_frame,
        })
    }

    pub fn start_frame(self) -> u64 {
        self.start_frame
    }
    pub fn end_frame(self) -> u64 {
        self.end_frame
    }

    fn wrap(self, position: u64) -> u64 {
        if position < self.end_frame {
            position
        } else {
            self.start_frame + (position - self.start_frame) % (self.end_frame - self.start_frame)
        }
    }
}

pub fn bar_to_frame(clock: TransportClock, bar: f64) -> u64 {
    (((bar - 1.0).max(0.0) / clock.bars_per_second) * f64::from(clock.sample_rate)).round() as u64
}

pub fn frame_to_bar(clock: TransportClock, frame: u64) -> f64 {
    1.0 + (frame as f64 / f64::from(clock.sample_rate)) * clock.bars_per_second
}

/// Signed source offset in bars, wrapped into `0..frames` like looped clip
/// playback. `None` for an empty source.
pub fn source_offset_frame(clock: TransportClock, offset_bars: f64, frames: u64) -> Option<u64> {
    let offset =
        (offset_bars / clock.bars_per_second * f64::from(clock.sample_rate)).round() as i128;
    (frames > 0).then(|| offset.rem_euclid(i128::from(frames)) as u64)
}

/// Allocation-free source ranges for a render block, including repeated loops.
/// Positions before the loop start play through normally; positions at or past
/// the loop end wrap before rendering. Without a loop, the frame domain ends
/// at `u64::MAX`, so a block at that boundary is truncated rather than overflowed.
#[derive(Clone, Debug)]
pub struct Segments {
    position: u64,
    remaining: u64,
    loop_region: Option<LoopRegion>,
}

pub fn segments(position: u64, frames: u32, loop_region: Option<LoopRegion>) -> Segments {
    let position = loop_region.map_or(position, |region| region.wrap(position));
    Segments {
        position,
        remaining: if loop_region.is_none() {
            u64::from(frames).min(u64::MAX - position)
        } else {
            u64::from(frames)
        },
        loop_region,
    }
}

impl Iterator for Segments {
    type Item = Range<u64>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.remaining == 0 {
            return None;
        }
        let end = self.loop_region.map_or(u64::MAX, |region| region.end_frame);
        let count = self.remaining.min(end - self.position);
        let range = self.position..self.position + count;
        self.remaining -= count;
        self.position = self
            .loop_region
            .map_or(range.end, |region| region.wrap(range.end));
        Some(range)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let count = if self.remaining == 0 {
            0
        } else if let Some(region) = self.loop_region {
            let first = region.end_frame - self.position;
            1 + self
                .remaining
                .saturating_sub(first)
                .div_ceil(region.end_frame - region.start_frame)
        } else {
            1
        } as usize;
        (count, Some(count))
    }
}

impl ExactSizeIterator for Segments {}
impl std::iter::FusedIterator for Segments {}

#[derive(Clone, Debug)]
pub struct AdvanceResult {
    pub segments: Segments,
    pub position_frame: u64,
}

#[derive(Clone, Debug)]
pub struct Transport {
    pub clock: TransportClock,
    pub position_frame: u64,
    pub playing: bool,
    pub loop_region: Option<LoopRegion>,
}

impl Transport {
    pub fn from_control(
        clock: TransportClock,
        project: &BackendProject,
        control: &BackendControl,
    ) -> Self {
        let region = &project.loop_region;
        Self {
            clock,
            position_frame: bar_to_frame(clock, control.seek_bar),
            playing: control.playing,
            loop_region: if region.enabled {
                LoopRegion::new(
                    bar_to_frame(clock, region.start_bar),
                    bar_to_frame(clock, region.end_bar),
                )
            } else {
                None
            },
        }
    }

    /// Seeking stores the exact frame, even outside an enabled loop. Wrapping
    /// happens at the next nonempty playing block, never during a stopped seek.
    pub fn seek(&mut self, frame: u64) {
        self.position_frame = frame;
    }

    pub fn set_loop(&mut self, loop_region: Option<LoopRegion>) {
        self.loop_region = loop_region;
    }

    pub fn advance(&mut self, frames: u32) -> AdvanceResult {
        if !self.playing || frames == 0 {
            return AdvanceResult {
                segments: segments(self.position_frame, 0, self.loop_region),
                position_frame: self.position_frame,
            };
        }
        let rendered = segments(self.position_frame, frames, self.loop_region);
        let position = rendered.position;
        self.position_frame = if let Some(region) = self.loop_region {
            let until_end = region.end_frame - position;
            if u64::from(frames) < until_end {
                position + u64::from(frames)
            } else {
                region.start_frame
                    + (u64::from(frames) - until_end) % (region.end_frame - region.start_frame)
            }
        } else {
            position.saturating_add(u64::from(frames))
        };
        AdvanceResult {
            segments: rendered,
            position_frame: self.position_frame,
        }
    }

    pub fn to_backend_clock(&self) -> BackendClock {
        BackendClock::Sample {
            bar: frame_to_bar(self.clock, self.position_frame),
            bars_per_second: self.clock.bars_per_second,
            frame: self.position_frame,
            sample_rate: self.clock.sample_rate,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::BackendLoopRegion;

    fn transport(position: u64) -> Transport {
        Transport {
            clock: TransportClock::new(48000, 0.5).unwrap(),
            position_frame: position,
            playing: true,
            loop_region: LoopRegion::new(100, 110),
        }
    }

    #[test]
    fn bar_frame_round_trip_at_audio_sample_rates() {
        for sample_rate in [44100, 48000] {
            let clock = TransportClock::new(sample_rate, 120.0 / 60.0 / 4.0).unwrap();
            for bar in [1.0, 1.125, 2.0, 4.375, 129.12345] {
                let frame = bar_to_frame(clock, bar);
                assert!(
                    (frame_to_bar(clock, frame) - bar).abs()
                        <= clock.bars_per_second / f64::from(sample_rate) / 2.0 + 1e-12
                );
                assert_eq!(bar_to_frame(clock, frame_to_bar(clock, frame)), frame);
            }
            assert_eq!(bar_to_frame(clock, 1.0), 0);
            assert_eq!(bar_to_frame(clock, -3.0), 0);
            assert_eq!(bar_to_frame(clock, 0.9), 0);
            assert_eq!(bar_to_frame(clock, 2.0), 2 * u64::from(sample_rate));
        }
    }

    #[test]
    fn source_offset_wraps_signed_bars_into_the_source() {
        let clock = TransportClock::new(44100, 0.5).unwrap();
        assert_eq!(source_offset_frame(clock, 0.0, 1000), Some(0));
        assert_eq!(source_offset_frame(clock, 0.5, 100_000), Some(44100));
        assert_eq!(
            source_offset_frame(clock, -0.5, 100_000),
            Some(100_000 - 44100)
        );
        assert_eq!(source_offset_frame(clock, -0.5, 44100), Some(0));
        assert_eq!(source_offset_frame(clock, -3.0, 1000), Some(400));
        assert_eq!(source_offset_frame(clock, 1.0, 0), None);
    }

    #[test]
    fn crosses_loop_seam_exactly() {
        let mut t = transport(107);
        let result = t.advance(8);
        assert_eq!(result.segments.len(), 2);
        let ranges: Vec<_> = result.segments.collect();
        assert_eq!(ranges, [107..110, 100..105]);
        assert_eq!(ranges.iter().map(|r| r.end - r.start).sum::<u64>(), 8);
        assert_eq!(result.position_frame, 105);
        assert!(t.advance(5).segments.eq(std::iter::once(105..110)));
        assert_eq!(t.position_frame, 100);
    }

    #[test]
    fn blocks_longer_than_loop_repeat_without_dropping_frames() {
        let mut t = transport(108);
        let result = t.advance(37);
        assert_eq!(result.segments.len(), 5);
        let ranges: Vec<_> = result.segments.collect();
        assert_eq!(ranges, [108..110, 100..110, 100..110, 100..110, 100..105]);
        assert_eq!(ranges.iter().map(|r| r.end - r.start).sum::<u64>(), 37);
        assert_eq!(t.position_frame, 105);
    }

    #[test]
    fn seeks_inside_before_and_after_loop() {
        let mut t = transport(100);
        t.seek(102);
        assert!(t.advance(2).segments.eq(std::iter::once(102..104)));
        t.seek(97);
        assert_eq!(
            t.advance(15).segments.collect::<Vec<_>>(),
            [97..110, 100..102]
        );
        t.seek(123);
        assert_eq!(t.position_frame, 123);
        assert!(t.advance(3).segments.eq(std::iter::once(103..106)));
        t.seek(110);
        assert!(t.advance(1).segments.eq(std::iter::once(100..101)));
        t.set_loop(None);
        t.seek(123);
        assert!(t.advance(3).segments.eq(std::iter::once(123..126)));
    }

    #[test]
    fn invalid_loop_and_clock_are_rejected() {
        assert!(LoopRegion::new(10, 10).is_none());
        assert!(LoopRegion::new(10, 9).is_none());
        assert!(TransportClock::new(0, 0.5).is_none());
        for rate in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            assert!(TransportClock::new(48000, rate).is_none());
        }
    }

    #[test]
    fn stopped_or_empty_block_does_not_move_or_render() {
        let mut t = transport(123);
        t.playing = false;
        let result = t.advance(100);
        assert_eq!(result.segments.len(), 0);
        assert_eq!(t.position_frame, 123);
        t.playing = true;
        assert_eq!(t.advance(0).segments.len(), 0);
        assert_eq!(t.position_frame, 123);
    }

    #[test]
    fn control_conversion_and_backend_sample_clock() {
        let clock = TransportClock::new(48000, 0.5).unwrap();
        let mut project = BackendProject {
            bpm: 120.0,
            numerator: 4,
            denominator: 4,
            loop_region: BackendLoopRegion {
                enabled: true,
                start_bar: 2.0,
                end_bar: 3.0,
            },
            sources: vec![],
            tracks: vec![],
        };
        let control = BackendControl {
            playing: true,
            recording: false,
            seek_bar: 2.5,
            seek_generation: 0,
            held_notes: vec![],
            midi_velocity: 0.8,
        };
        let t = Transport::from_control(clock, &project, &control);
        assert_eq!(t.position_frame, 144000);
        assert_eq!(t.loop_region, LoopRegion::new(96000, 192000));
        assert_eq!(
            t.to_backend_clock(),
            BackendClock::Sample {
                bar: 2.5,
                bars_per_second: 0.5,
                frame: 144000,
                sample_rate: 48000
            }
        );
        project.loop_region.enabled = false;
        assert!(Transport::from_control(clock, &project, &control)
            .loop_region
            .is_none());
        project.loop_region.enabled = true;
        project.loop_region.end_bar = 2.0;
        assert!(Transport::from_control(clock, &project, &control)
            .loop_region
            .is_none());
    }

    #[test]
    fn segments_iterator_length_and_integer_boundary() {
        let mut ranges = segments(108, 22, LoopRegion::new(100, 110));
        assert_eq!(ranges.len(), 3);
        assert_eq!(ranges.next(), Some(108..110));
        assert_eq!(ranges.len(), 2);
        assert_eq!(ranges.next(), Some(100..110));
        assert_eq!(ranges.next(), Some(100..110));
        assert_eq!(ranges.len(), 0);
        assert_eq!(ranges.next(), None);
        let mut t = transport(u64::MAX - 2);
        t.set_loop(None);
        assert!(t
            .advance(8)
            .segments
            .eq(std::iter::once(u64::MAX - 2..u64::MAX)));
        assert_eq!(t.position_frame, u64::MAX);
    }
}
