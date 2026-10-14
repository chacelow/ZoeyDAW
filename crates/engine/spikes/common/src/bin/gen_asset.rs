use spike_common::{asset_path, FRAMES, RATE};

fn main() {
    let mut writer = hound::WavWriter::create(
        asset_path(),
        hound::WavSpec {
            channels: 2,
            sample_rate: RATE,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        },
    )
    .unwrap();
    for frame in 0..FRAMES {
        let t = frame as f64 / RATE as f64;
        // Left is periodic; right chirp disambiguates source offsets. Both loop-seam values tend to zero.
        let envelope = (std::f64::consts::PI * (frame % 4800) as f64 / 4800.0)
            .sin()
            .powi(2);
        let samples = [
            0.4 * (std::f64::consts::TAU * 100.0 * t).sin(),
            0.3 * envelope * (std::f64::consts::TAU * (210.0 * t + 7.0 * t * t)).sin(),
        ];
        for sample in samples {
            writer
                .write_sample((sample * 32767.0).round() as i16)
                .unwrap();
        }
    }
    writer.finalize().unwrap();
    println!(
        "asset={} frames={FRAMES} sample_rate={RATE} bytes={}",
        asset_path().display(),
        std::fs::metadata(asset_path()).unwrap().len()
    );
}
