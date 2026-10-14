use rodio::{buffer::SamplesBuffer, mixer, DeviceSinkBuilder, Player, Source};
use spike_common::{bench, duration, pcm, report_samples, RATE};
use std::{
    num::NonZeroU32,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

fn buffer() -> SamplesBuffer {
    SamplesBuffer::new(
        2.try_into().unwrap(),
        NonZeroU32::new(RATE).unwrap(),
        pcm().into_iter().flatten().collect::<Vec<_>>(),
    )
}

fn pull(source: &mut impl Iterator<Item = f32>, frames: usize) -> Vec<[f32; 2]> {
    (0..frames)
        .map(|_| [source.next().unwrap_or(0.0), source.next().unwrap_or(0.0)])
        .collect()
}

fn offline() {
    println!("engine=rodio version=0.23.0 mode=offline rate={RATE}");
    let source = buffer();
    {
        let (mix, mut output) = mixer::mixer(2.try_into().unwrap(), RATE.try_into().unwrap());
        let player = Player::connect_new(&mix);
        player.append(source.clone());
        report_samples("connect_before_append_bootstrap", &pull(&mut output, 64), 0);
    }
    for offset in [0, 12345, 144001] {
        let mut clip = source.clone();
        clip.try_seek(duration(offset)).unwrap();
        let (mix, mut output) = mixer::mixer(2.try_into().unwrap(), RATE.try_into().unwrap());
        let (player, queue) = Player::new();
        player.append(clip);
        mix.add(queue);
        report_samples(
            "offset_append_before_connect",
            &pull(&mut output, 64),
            offset,
        );
    }
    let start = 4800;
    let end = 9600;
    let looping = source
        .clone()
        .skip_duration(duration(start))
        .take_duration(duration(end - start))
        .repeat_infinite();
    let (mix, mut output) = mixer::mixer(2.try_into().unwrap(), RATE.try_into().unwrap());
    let (loop_player, queue) = Player::new();
    loop_player.append(looping);
    mix.add(queue);
    let actual = pull(&mut output, (end - start) * 3 + 64);
    let reference = pcm();
    let error = actual
        .iter()
        .enumerate()
        .flat_map(|(i, a)| [0, 1].map(|c| (a[c] - reference[start + i % (end - start)][c]).abs()))
        .fold(0.0_f32, f32::max);
    println!("loop start={start} end={end} wraps=3 max_sample_error={error:.9} seam_left={:?} seam_right={:?} expected_left={:?} expected_right={:?}", actual[end-start-1], actual[end-start], reference[end-1], reference[start]);
    let (mix, mut output) = mixer::mixer(2.try_into().unwrap(), RATE.try_into().unwrap());
    let (player, queue) = Player::new();
    player.append(source.clone());
    mix.add(queue);
    pull(&mut output, 1000);
    let before = player.get_pos().as_secs_f64() * RATE as f64;
    player.pause();
    let transition = pull(&mut output, 256);
    let first_silent = transition.iter().position(|f| *f == [0.0, 0.0]);
    let paused = pull(&mut output, 1024);
    println!("pause before_clock_frame={before:.3} settled_clock_frame={:.3} first_silent_after_frames={first_silent:?} paused_peak={:.9}", player.get_pos().as_secs_f64()*RATE as f64, paused.iter().flatten().copied().map(f32::abs).fold(0.0_f32, f32::max));
    player.play();
    let resumed = pull(&mut output, 512);
    println!(
        "resume peak={:.6} clock_frame={:.3}",
        resumed
            .iter()
            .flatten()
            .copied()
            .map(f32::abs)
            .fold(0.0_f32, f32::max),
        player.get_pos().as_secs_f64() * RATE as f64
    );

    // Player::try_seek waits for audio-thread acknowledgement. Keep pulling while it waits.
    let started = AtomicBool::new(false);
    std::thread::scope(|scope| {
        let seeker = scope.spawn(|| {
            started.store(true, Ordering::Release);
            player.try_seek(duration(12345)).unwrap();
        });
        while !started.load(Ordering::Acquire) {
            std::thread::yield_now();
        }
        // Let the control thread publish its command; this is NOT included in latency frames.
        std::thread::sleep(Duration::from_millis(10));
        let seek_output = pull(&mut output, 1024);
        let target = &reference[12345..12345 + 8];
        let detected = seek_output.windows(8).position(|w| {
            w.iter()
                .zip(target)
                .all(|(a, b)| a.iter().zip(b).all(|(x, y)| (x - y).abs() < 1e-5))
        });
        seeker.join().unwrap();
        println!("seek target=12345 first_target_after_frames={detected:?} control_cadence_frames=240 clock_frame={:.3}", player.get_pos().as_secs_f64()*RATE as f64);
        if let Some(i) = detected {
            report_samples("seek_first_block", &seek_output[i..i + 64], 12345);
        }
    });
    for voices in [8, 64, 256] {
        let (mixer, mut out) = mixer::mixer(2.try_into().unwrap(), RATE.try_into().unwrap());
        let players: Vec<_> = (0..voices)
            .map(|_| {
                let (player, queue) = Player::new();
                player.append(source.clone());
                mixer.add(queue);
                player
            })
            .collect();
        bench("rodio", voices, || {
            for _ in 0..512 {
                std::hint::black_box(out.next());
            }
        });
        std::hint::black_box(players);
    }
    println!("audit callback Player::append periodic_access(5ms) locks to_clear/position/volume/speed/seek; mixer inserts pending sources into Vec, queue uses Mutex; not hard-realtime-safe");
}

fn device() {
    let stream = DeviceSinkBuilder::open_default_sink().expect("audio device unavailable");
    println!(
        "device engine=rodio rate={} channels={} buffer={:?}",
        stream.config().sample_rate(),
        stream.config().channel_count(),
        stream.config().buffer_size()
    );
    let (player, queue) = Player::new();
    player.set_volume(0.05);
    player.append(buffer());
    stream.mixer().add(queue);
    std::thread::sleep(Duration::from_secs(2));
    println!(
        "device clock_source=Player::get_pos frame_at_asset_rate={:.3} playing={}",
        player.get_pos().as_secs_f64() * RATE as f64,
        !player.is_paused()
    );
    player.pause();
    std::thread::sleep(Duration::from_millis(30));
    println!(
        "device paused_frame={:.3}",
        player.get_pos().as_secs_f64() * RATE as f64
    );
    player.try_seek(duration(12345)).unwrap();
    player.play();
    std::thread::sleep(Duration::from_millis(100));
    println!(
        "device after_seek_resume_frame={:.3}",
        player.get_pos().as_secs_f64() * RATE as f64
    );
}

fn main() {
    if std::env::args().any(|a| a == "--device") {
        device();
    } else {
        offline();
    }
}
