use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

pub const RATE: u32 = 48_000;
pub const FRAMES: usize = 480_000;

pub fn asset_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/probe.wav")
}

pub fn pcm() -> Vec<[f32; 2]> {
    let mut reader = hound::WavReader::open(asset_path()).expect("run gen-asset first");
    assert_eq!(reader.spec().sample_rate, RATE);
    assert_eq!(reader.spec().channels, 2);
    let samples: Vec<_> = reader
        .samples::<i16>()
        .map(|v| v.unwrap() as f32 / 32768.0)
        .collect();
    samples.chunks_exact(2).map(|s| [s[0], s[1]]).collect()
}

pub fn duration(frame: usize) -> Duration {
    Duration::from_nanos((frame as u64 * 1_000_000_000).div_ceil(RATE as u64))
}

pub fn report_samples(label: &str, actual: &[[f32; 2]], expected_start: usize) {
    let source = pcm();
    let error = actual
        .iter()
        .enumerate()
        .flat_map(|(i, a)| {
            [0, 1].map(|c| (a[c] - source[(expected_start + i) % source.len()][c]).abs())
        })
        .fold(0.0_f32, f32::max);
    println!(
        "{label} requested_frame={expected_start} max_sample_error={error:.9} frames={}",
        actual.len()
    );
}

pub fn bench(label: &str, voices: usize, mut render: impl FnMut()) {
    for _ in 0..16 {
        render();
    }
    let audio_seconds = 200.0 * 256.0 / RATE as f64;
    let mut cpu = [0.0_f64; 5];
    let mut wall = [0.0_f64; 5];
    for repeat in 0..5 {
        let cpu_start = cpu_time::ProcessTime::now();
        let wall_start = Instant::now();
        for _ in 0..200 {
            render();
        }
        let wall_elapsed = wall_start.elapsed();
        let cpu_elapsed = cpu_start.elapsed();
        cpu[repeat] = cpu_elapsed.as_secs_f64() / audio_seconds * 100.0;
        wall[repeat] = wall_elapsed.as_secs_f64() / audio_seconds * 100.0;
        println!("bench_run engine={label} clips={voices} repeat={} blocks=200 frames_per_block=256 cpu_us={} wall_us={} cpu_audio_pct={:.4} wall_audio_pct={:.4}", repeat + 1, cpu_elapsed.as_micros(), wall_elapsed.as_micros(), cpu[repeat], wall[repeat]);
    }
    cpu.sort_by(f64::total_cmp);
    wall.sort_by(f64::total_cmp);
    println!("bench_summary engine={label} clips={voices} repeats=5 cpu_median_pct={:.4} cpu_max_pct={:.4} wall_median_pct={:.4} wall_max_pct={:.4} cpu_scope=whole_process_no_device_output", cpu[2], cpu[4], wall[2], wall[4]);
}
