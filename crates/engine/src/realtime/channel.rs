use super::{
    ballistics::PeakDisplay,
    protocol_generated::*,
    rms::{EnergyEpoch, RmsReading, RmsWindow},
};
use std::time::Duration;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EpochPublication {
    pub energy: EnergyEpoch,
    pub display_peak: f32,
    pub hold_reset_epoch: u32,
    pub valid: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ChannelPublication {
    pub completed: Option<EpochPublication>,
    pub current: EpochPublication,
    pub session_peak: f32,
    pub clip_count: u64,
    pub slot_reset_epoch: u32,
    pub hold_reset_epoch: u32,
    pub available: bool,
}

pub struct MeterChannel {
    rms: RmsWindow,
    display: PeakDisplay,
    latest: Option<ChannelPublication>,
    peak_epoch: u64,
    completed_peak_epoch: u64,
    peak_end_sample: u64,
    hold_reset_epoch: u32,
    last_received: Option<Duration>,
}

impl MeterChannel {
    pub fn new(sample_rate: f64) -> Option<Self> {
        Some(Self {
            rms: RmsWindow::new(sample_rate)?,
            display: PeakDisplay::default(),
            latest: None,
            peak_epoch: 0,
            completed_peak_epoch: 0,
            peak_end_sample: 0,
            hold_reset_epoch: 0,
            last_received: None,
        })
    }

    pub fn accept(&mut self, publication: ChannelPublication, now: Duration) -> bool {
        if self.latest == Some(publication) {
            return false;
        }
        if self.last_received.is_some_and(|previous| now < previous)
            || self.latest.is_some_and(|previous| {
                publication.current.energy.id < previous.current.energy.id
                    || publication.slot_reset_epoch < previous.slot_reset_epoch
                    || (publication.current.energy.id == previous.current.energy.id
                        && publication.current.energy.end_sample
                            < previous.current.energy.end_sample)
            })
        {
            return false;
        }
        if self
            .last_received
            .is_some_and(|previous| now - previous > Duration::from_millis(50))
        {
            if let Some(previous) = self.latest {
                self.rms.invalidate(previous.current.energy.id);
            }
        }
        if publication.hold_reset_epoch != self.hold_reset_epoch {
            self.hold_reset_epoch = publication.hold_reset_epoch;
            self.display.reset(now);
            self.peak_epoch = 0;
            self.completed_peak_epoch = 0;
            self.peak_end_sample = 0;
        }
        let mut peak = 0.0_f32;
        for (epoch, completed) in publication
            .completed
            .into_iter()
            .map(|value| (value, true))
            .chain(std::iter::once((publication.current, false)))
        {
            if epoch.valid {
                self.rms.accept(epoch.energy);
            } else {
                self.rms.invalidate(epoch.energy.id);
            }
            let fresh = if completed {
                epoch.energy.id > self.completed_peak_epoch
                    && (epoch.energy.id != self.peak_epoch
                        || epoch.energy.end_sample > self.peak_end_sample)
            } else {
                epoch.energy.id > self.peak_epoch || epoch.energy.end_sample > self.peak_end_sample
            };
            if fresh
                && epoch.valid
                && epoch.hold_reset_epoch == self.hold_reset_epoch
                && epoch.display_peak.is_finite()
                && epoch.display_peak >= 0.0
            {
                peak = peak.max(epoch.display_peak);
            }
            if completed {
                self.completed_peak_epoch = self.completed_peak_epoch.max(epoch.energy.id);
            } else {
                self.peak_epoch = epoch.energy.id;
                self.peak_end_sample = epoch.energy.end_sample;
            }
        }
        self.display
            .advance(now, publication.available.then_some(peak));
        self.latest = Some(publication);
        self.last_received = Some(now);
        true
    }

    pub fn snapshot(&mut self, slot_id: u32, now: Duration, active: bool) -> WireRecord {
        let (peak, hold) = self.display.advance(now, None);
        let Some(latest) = self.latest else {
            return WireRecord {
                slot_id,
                flags: RECORD_FLAGS_UNAVAILABLE as u32,
                block_end_sample: 0,
                peak,
                rms: 0.0,
                hold,
                session_peak: 0.0,
                clip_count: 0,
                valid_frames: 0,
                slot_reset_epoch: 0,
            };
        };
        let fresh = active
            && self.last_received.is_some_and(|received| {
                now >= received && now - received <= Duration::from_millis(50)
            });
        let valid = fresh
            && latest.available
            && latest.current.valid
            && latest.session_peak.is_finite()
            && latest.session_peak >= 0.0;
        let mut flags = if valid {
            RECORD_FLAGS_VALID
        } else {
            RECORD_FLAGS_STALE
        } as u32;
        if !latest.available {
            flags |= RECORD_FLAGS_UNAVAILABLE as u32;
        }
        if latest.clip_count > 0 {
            flags |= RECORD_FLAGS_CLIPPED as u32;
        }
        let (rms, valid_frames) = match self.rms.read(latest.current.energy.end_sample) {
            RmsReading::Ready { amplitude, frames } if valid => (amplitude, frames),
            RmsReading::Initializing if valid => {
                flags |= RECORD_FLAGS_RMS_INITIALIZING as u32;
                (0.0, 0)
            }
            _ => {
                flags |= RECORD_FLAGS_RMS_STALE as u32;
                (0.0, 0)
            }
        };
        WireRecord {
            slot_id,
            flags,
            block_end_sample: latest.current.energy.end_sample,
            peak,
            rms,
            hold,
            session_peak: if latest.session_peak.is_finite() {
                latest.session_peak.max(0.0)
            } else {
                0.0
            },
            clip_count: latest.clip_count,
            valid_frames,
            slot_reset_epoch: latest.slot_reset_epoch,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn publication(id: u64, start: u64, count: u64, peak: f32) -> ChannelPublication {
        ChannelPublication {
            completed: None,
            current: EpochPublication {
                energy: EnergyEpoch {
                    id,
                    start_sample: start,
                    end_sample: start + count,
                    frames: count,
                    sum_squares: f64::from(peak).powi(2) * count as f64,
                },
                display_peak: peak,
                hold_reset_epoch: 0,
                valid: true,
            },
            session_peak: peak,
            clip_count: u64::from(peak >= 1.0),
            slot_reset_epoch: 0,
            hold_reset_epoch: 0,
            available: true,
        }
    }

    #[test]
    fn duplicate_completed_epoch_does_not_keep_peak_hold_alive() {
        let mut channel = MeterChannel::new(1000.0).unwrap();
        let impulse = publication(1, 0, 10, 1.25);
        channel.accept(impulse, Duration::ZERO);
        let mut silence = publication(2, 10, 10, 0.0);
        silence.completed = Some(impulse.current);
        silence.session_peak = 1.25;
        silence.clip_count = 1;
        for tick in 1..=100 {
            channel.accept(silence, Duration::from_millis(tick * 10));
        }
        let record = channel.snapshot(7, Duration::from_secs(1), true);
        assert!((record.hold - 1.25 * 10.0_f32.powf(-9.6 / 20.0)).abs() < 1e-6);
        assert_eq!(record.session_peak, 1.25);
        assert_eq!(record.clip_count, 1);
        assert_eq!(record.slot_id, 7);
        assert_eq!(record.flags & RECORD_FLAGS_VALID as u32, 0);
        assert_ne!(record.flags & RECORD_FLAGS_STALE as u32, 0);
    }

    #[test]
    fn stale_interval_requires_fresh_energy_and_invalid_completed_epoch_does_not_erase_recovery() {
        let mut channel = MeterChannel::new(1000.0).unwrap();
        channel.accept(publication(1, 0, 300, 0.5), Duration::ZERO);
        let mut invalid = publication(2, 300, 10, 0.0);
        invalid.current.valid = false;
        channel.accept(invalid, Duration::from_millis(10));
        for id in 3..=32 {
            let mut next = publication(id, 310 + (id - 3) * 10, 10, 0.25);
            next.completed = Some(invalid.current);
            channel.accept(next, Duration::from_millis((id - 1) * 10));
        }
        assert_eq!(
            channel.snapshot(0, Duration::from_millis(310), true).rms,
            0.25
        );
        channel.accept(publication(33, 610, 10, 0.5), Duration::from_millis(500));
        let resumed = channel.snapshot(0, Duration::from_millis(500), true);
        assert_eq!(resumed.rms, 0.0);
        assert_ne!(resumed.flags & RECORD_FLAGS_RMS_STALE as u32, 0);
    }

    #[test]
    fn reset_and_stopped_source_do_not_replay_old_peak_or_valid_rms() {
        let mut channel = MeterChannel::new(1000.0).unwrap();
        let impulse = publication(1, 0, 300, 1.25);
        channel.accept(impulse, Duration::ZERO);
        let before = channel.snapshot(1, Duration::ZERO, true);
        assert_eq!(before.rms, 1.25);
        let mut reset = publication(2, 300, 10, 0.25);
        reset.completed = Some(impulse.current);
        reset.slot_reset_epoch = 1;
        reset.hold_reset_epoch = 1;
        reset.current.hold_reset_epoch = 1;
        channel.accept(reset, Duration::from_millis(10));
        let after = channel.snapshot(1, Duration::from_millis(10), true);
        assert_eq!(after.hold, 0.25);
        assert_eq!(after.session_peak, 0.25);
        assert_eq!(after.slot_reset_epoch, 1);
        let stopped = channel.snapshot(1, Duration::from_millis(100), false);
        assert_eq!(stopped.flags & RECORD_FLAGS_VALID as u32, 0);
        assert_ne!(stopped.flags & RECORD_FLAGS_RMS_STALE as u32, 0);
        assert_eq!(stopped.rms, 0.0);
        assert!(!channel.accept(impulse, Duration::from_millis(110)));
    }
}
