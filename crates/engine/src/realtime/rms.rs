use std::collections::VecDeque;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EnergyEpoch {
    pub id: u64,
    pub start_sample: u64,
    pub end_sample: u64,
    pub frames: u64,
    pub sum_squares: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RmsReading {
    Initializing,
    Stale,
    Ready { amplitude: f32, frames: u32 },
}

pub struct RmsWindow {
    epochs: VecDeque<EnergyEpoch>,
    frames: u64,
    energy: f64,
    sample_rate: f64,
    target_frames: u64,
    max_frames: u64,
    rejected_through: u64,
    stale: bool,
}

impl RmsWindow {
    pub fn new(sample_rate: f64) -> Option<Self> {
        if !sample_rate.is_finite() || !(1.0..=768_000.0).contains(&sample_rate) {
            return None;
        }
        Some(Self {
            epochs: VecDeque::new(),
            frames: 0,
            energy: 0.0,
            sample_rate,
            target_frames: (sample_rate * 0.3).ceil() as u64,
            max_frames: (sample_rate * 0.35).ceil() as u64,
            rejected_through: 0,
            stale: false,
        })
    }

    pub fn accept(&mut self, epoch: EnergyEpoch) -> bool {
        if epoch.id == 0 || epoch.id <= self.rejected_through {
            return false;
        }
        if self.epochs.back().is_some_and(|last| epoch.id < last.id) {
            return false;
        }
        if epoch.frames == 0
            || epoch.end_sample.checked_sub(epoch.start_sample) != Some(epoch.frames)
            || !epoch.sum_squares.is_finite()
            || epoch.sum_squares < 0.0
            || epoch.frames > self.max_frames
        {
            self.invalidate(epoch.id);
            return false;
        }
        if let Some(last) = self.epochs.back() {
            let last = *last;
            if epoch.id == last.id {
                if epoch == last {
                    return false;
                }
                if epoch.start_sample != last.start_sample
                    || epoch.frames <= last.frames
                    || epoch.sum_squares < last.sum_squares
                {
                    self.invalidate(epoch.id);
                    return false;
                }
                self.epochs.pop_back();
                self.frames -= last.frames;
                self.energy -= last.sum_squares;
            } else if last.id.checked_add(1) != Some(epoch.id)
                || epoch.start_sample != last.end_sample
            {
                self.epochs.clear();
                self.frames = 0;
                self.energy = 0.0;
                self.stale = true;
            }
        }
        self.epochs.push_back(epoch);
        self.frames += epoch.frames;
        self.energy += epoch.sum_squares;
        while let Some(first) = self.epochs.front() {
            if self.frames - first.frames < self.target_frames {
                break;
            }
            self.frames -= first.frames;
            self.energy -= first.sum_squares;
            self.epochs.pop_front();
        }
        if self.frames > self.max_frames {
            self.invalidate(epoch.id);
        } else if self.frames >= self.target_frames {
            self.stale = false;
        }
        true
    }

    pub fn invalidate(&mut self, through_epoch: u64) {
        if through_epoch <= self.rejected_through
            || self
                .epochs
                .back()
                .is_some_and(|last| through_epoch < last.id)
        {
            return;
        }
        self.rejected_through = self.rejected_through.max(through_epoch);
        self.epochs.clear();
        self.frames = 0;
        self.energy = 0.0;
        self.stale = true;
    }

    pub fn read(&self, latest_sample: u64) -> RmsReading {
        let Some(last) = self.epochs.back() else {
            return if self.stale {
                RmsReading::Stale
            } else {
                RmsReading::Initializing
            };
        };
        if latest_sample < last.end_sample
            || (latest_sample - last.end_sample) as f64 / self.sample_rate > 0.05
        {
            return RmsReading::Stale;
        }
        if self.frames < self.target_frames {
            return if self.stale {
                RmsReading::Stale
            } else {
                RmsReading::Initializing
            };
        }
        let amplitude = (self.energy.max(0.0) / self.frames as f64).sqrt();
        if !amplitude.is_finite() || amplitude > f32::MAX as f64 {
            return RmsReading::Stale;
        }
        RmsReading::Ready {
            amplitude: amplitude as f32,
            frames: self.frames as u32,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn epoch(id: u64, start: u64, frames: u64, amplitude: f64) -> EnergyEpoch {
        EnergyEpoch {
            id,
            start_sample: start,
            end_sample: start + frames,
            frames,
            sum_squares: amplitude * amplitude * frames as f64,
        }
    }

    #[test]
    fn cumulative_updates_replace_energy_and_completed_replays_do_not_duplicate_it() {
        let mut window = RmsWindow::new(48_000.0).unwrap();
        assert_eq!(window.read(0), RmsReading::Initializing);
        window.accept(epoch(1, 0, 480, 0.5));
        window.accept(epoch(1, 0, 960, 0.5));
        assert!(!window.accept(epoch(1, 0, 960, 0.5)));
        for id in 2..=29 {
            window.accept(epoch(id, id * 480, 480, 0.5));
        }
        assert_eq!(
            window.read(14_400),
            RmsReading::Ready {
                amplitude: 0.5,
                frames: 14_400
            }
        );
        assert!(!window.accept(epoch(1, 0, 960, 0.5)));
        assert_eq!(
            window.read(14_400),
            RmsReading::Ready {
                amplitude: 0.5,
                frames: 14_400
            }
        );
    }

    #[test]
    fn window_retains_whole_epochs_instead_of_interpolating_energy() {
        let mut window = RmsWindow::new(1000.0).unwrap();
        for id in 1..=10 {
            window.accept(epoch(id, (id - 1) * 32, 32, 0.25));
        }
        assert_eq!(
            window.read(320),
            RmsReading::Ready {
                amplitude: 0.25,
                frames: 320
            }
        );
        window.accept(epoch(11, 320, 32, 0.25));
        assert_eq!(
            window.read(352),
            RmsReading::Ready {
                amplitude: 0.25,
                frames: 320
            }
        );
    }

    #[test]
    fn oversized_epoch_is_stale_until_a_fresh_window_accumulates() {
        let mut window = RmsWindow::new(1000.0).unwrap();
        window.accept(epoch(1, 0, 351, 1.0));
        assert_eq!(window.read(351), RmsReading::Stale);
        assert!(!window.accept(epoch(1, 0, 352, 1.0)));
        for id in 2..=31 {
            window.accept(epoch(id, 351 + (id - 2) * 10, 10, 0.125));
        }
        assert_eq!(
            window.read(651),
            RmsReading::Ready {
                amplitude: 0.125,
                frames: 300
            }
        );
    }

    #[test]
    fn discontinuity_and_invalid_energy_require_reinitialization() {
        let mut window = RmsWindow::new(1000.0).unwrap();
        window.accept(epoch(1, 0, 300, 0.5));
        assert_eq!(window.read(351), RmsReading::Stale);
        window.accept(epoch(3, 500, 100, 0.25));
        assert_eq!(window.read(600), RmsReading::Stale);
        window.accept(epoch(4, 600, 100, 0.25));
        window.accept(epoch(5, 700, 100, 0.25));
        assert_eq!(
            window.read(800),
            RmsReading::Ready {
                amplitude: 0.25,
                frames: 300
            }
        );
        assert!(!window.accept(epoch(6, 800, 10, f64::NAN)));
        assert_eq!(window.read(810), RmsReading::Stale);
        assert!(!window.accept(epoch(5, 700, 100, 0.25)));
    }
}
