#[derive(Clone)]
pub(super) struct Fade {
    start: u64,
    length: u64,
    weight: f64,
    out: bool,
}

impl Fade {
    pub fn new(start: u64, length: u64, position: f64, curve: f64, out: bool) -> Self {
        let x = position.clamp(0.1, 0.9);
        let y = 0.5 + curve.clamp(-1.0, 1.0) * 0.4;
        let ratio = x / (1.0 - x);
        Self {
            start,
            length,
            weight: ratio * ratio * (1.0 - y) / y,
            out,
        }
    }

    pub fn gain(&self, frame: u64) -> f32 {
        if self.length == 0 {
            return 1.0;
        }
        let x = ((frame as f64 - self.start as f64) / self.length as f64).clamp(0.0, 1.0);
        let square = x * x;
        let value = square / (square + self.weight * (1.0 - x) * (1.0 - x));
        if self.out {
            (1.0 - value) as f32
        } else {
            value as f32
        }
    }
}
