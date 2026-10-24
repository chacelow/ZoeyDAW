use std::time::Duration;

#[derive(Default)]
pub struct PeakDisplay {
    peak: f32,
    hold: f32,
    hold_until: Duration,
    observed_at: Option<Duration>,
}

impl PeakDisplay {
    pub fn advance(&mut self, now: Duration, peak: Option<f32>) -> (f32, f32) {
        let previous = self.observed_at.unwrap_or(now);
        if now < previous {
            return (self.peak, self.hold);
        }
        self.observed_at = Some(now);
        let incoming = peak
            .filter(|value| value.is_finite() && *value >= 0.0)
            .unwrap_or(0.0);
        self.peak = incoming.max(decay(self.peak, now - previous));
        self.hold = decay(self.hold, now.saturating_sub(previous.max(self.hold_until)));
        if incoming > 0.0 && incoming >= self.hold {
            self.hold = incoming;
            self.hold_until = now.saturating_add(Duration::from_millis(600));
        }
        (self.peak, self.hold)
    }

    pub fn reset(&mut self, now: Duration) {
        self.peak = 0.0;
        self.hold = 0.0;
        self.hold_until = now;
        self.observed_at = Some(now);
    }
}

fn decay(value: f32, elapsed: Duration) -> f32 {
    if value == 0.0 || elapsed.is_zero() {
        return value;
    }
    (f64::from(value) * 10.0_f64.powf(-24.0 * elapsed.as_secs_f64() / 20.0)) as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn holds_for_six_hundred_ms_then_decays_without_frame_rate_dependence() {
        for hz in [20, 30, 60, 120, 144] {
            let mut display = PeakDisplay::default();
            assert_eq!(display.advance(Duration::ZERO, Some(1.0)), (1.0, 1.0));
            for step in 1..=hz {
                display.advance(
                    Duration::from_secs_f64(f64::from(step) / f64::from(hz)),
                    None,
                );
            }
            let (peak, hold) = display.advance(Duration::from_secs(1), None);
            assert!((peak - 10.0_f32.powf(-24.0 / 20.0)).abs() < 1e-6);
            assert!((hold - 10.0_f32.powf(-9.6 / 20.0)).abs() < 1e-6);
        }
    }

    #[test]
    fn reset_drops_old_hold_but_preserves_new_peak_attack() {
        let mut display = PeakDisplay::default();
        display.advance(Duration::ZERO, Some(1.25));
        display.reset(Duration::from_millis(10));
        assert_eq!(
            display.advance(Duration::from_millis(20), Some(0.25)),
            (0.25, 0.25)
        );
        assert_eq!(
            display.advance(Duration::from_millis(15), Some(2.0)),
            (0.25, 0.25)
        );
        let (peak, hold) = display.advance(Duration::from_millis(120), Some(f32::NAN));
        assert!(peak < 0.25);
        assert_eq!(hold, 0.25);
    }
}
