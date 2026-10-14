use std::{convert::Infallible, sync::Arc, time::Duration};

use kira::{
    backend::{cpal::CpalBackend, Backend, Renderer},
    sound::{
        static_sound::{StaticSoundData, StaticSoundSettings},
        PlaybackPosition,
    },
    track::MainTrackBuilder,
    AudioManager, AudioManagerSettings, Frame, Tween,
};
use spike_common::{bench, pcm, report_samples, RATE};

const BLOCK: usize = 256;

struct CaptureBackend {
    renderer: Option<Renderer>,
    output: [f32; BLOCK * 2],
    rendered: usize,
}

impl Backend for CaptureBackend {
    type Settings = ();
    type Error = Infallible;

    fn setup(_: (), _: usize) -> Result<(Self, u32), Infallible> {
        Ok((
            Self {
                renderer: None,
                output: [0.0; BLOCK * 2],
                rendered: 0,
            },
            RATE,
        ))
    }

    fn start(&mut self, renderer: Renderer) -> Result<(), Infallible> {
        self.renderer = Some(renderer);
        Ok(())
    }
}

impl CaptureBackend {
    fn render(&mut self) {
        let renderer = self.renderer.as_mut().expect("backend started");
        renderer.on_start_processing();
        renderer.process(&mut self.output, 2);
        self.rendered += BLOCK;
    }

    fn samples(&self) -> [[f32; 2]; BLOCK] {
        std::array::from_fn(|i| [self.output[i * 2], self.output[i * 2 + 1]])
    }
}

fn manager(voices: usize) -> AudioManager<CaptureBackend> {
    AudioManager::new(AudioManagerSettings {
        internal_buffer_size: BLOCK,
        main_track_builder: MainTrackBuilder::new().sound_capacity(voices),
        ..Default::default()
    })
    .expect("infallible capture backend")
}

fn max_error(actual: &[[f32; 2]], source: &[[f32; 2]], start: usize) -> f32 {
    actual
        .iter()
        .enumerate()
        .fold(0.0_f32, |error, (i, frame)| {
            error
                .max((frame[0] - source[start + i][0]).abs())
                .max((frame[1] - source[start + i][1]).abs())
        })
}

fn nearest_start(actual: &[[f32; 2]], source: &[[f32; 2]], requested: usize) -> (usize, f32) {
    (requested.saturating_sub(8)..=requested + 8)
        .map(|start| (start, max_error(actual, source, start)))
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .expect("nonempty search")
}

fn instant() -> Tween {
    Tween {
        duration: Duration::ZERO,
        ..Default::default()
    }
}

fn offsets(data: &StaticSoundData, source: &[[f32; 2]]) {
    for requested in [0, 12_345, 144_001] {
        let mut manager = manager(1);
        let handle = manager
            .play(data.start_position(PlaybackPosition::Samples(requested)))
            .expect("play offset");
        manager.backend_mut().render();
        let actual = manager.backend_mut().samples();
        let (observed, error) = nearest_start(&actual[..64], source, requested);
        println!("engine=kira probe=offset requested={requested} observed={observed} frames=64 max_error={error:.9} clock_seconds={:.9}", handle.position());
        report_samples("kira.offset", &actual[..64], requested);
    }
}

fn looping(data: &StaticSoundData, source: &[[f32; 2]]) {
    let mut manager = manager(1);
    let start = 9_600 - 64;
    let _handle = manager
        .play(
            data.start_position(PlaybackPosition::Samples(start))
                .loop_region(PlaybackPosition::Samples(4_800)..PlaybackPosition::Samples(9_600)),
        )
        .expect("play loop");
    manager.backend_mut().render();
    let actual = manager.backend_mut().samples();
    let error = actual
        .iter()
        .enumerate()
        .fold(0.0_f32, |error, (i, frame)| {
            let index = 4_800 + (start - 4_800 + i) % 4_800;
            error
                .max((frame[0] - source[index][0]).abs())
                .max((frame[1] - source[index][1]).abs())
        });
    println!("engine=kira probe=loop start=4800 end_exclusive=9600 boundary_output_frame=64 frames=256 max_error={error:.9} no_gap_or_duplicate={}", error <= 0.00001);
    for (output, expected) in [(63, 9_599), (64, 4_800), (65, 4_801)] {
        println!("engine=kira probe=loop_boundary output_frame={output} expected_source_frame={expected} left={:.9} right={:.9} expected_left={:.9} expected_right={:.9}", actual[output][0], actual[output][1], source[expected][0], source[expected][1]);
    }
}

fn transport(data: &StaticSoundData, source: &[[f32; 2]]) {
    let mut manager = manager(1);
    let mut handle = manager.play(data.clone()).expect("play transport");
    for _ in 0..2 {
        manager.backend_mut().render();
        let rendered = manager.backend_mut().rendered;
        println!("engine=kira probe=clock type=source_position_f64_seconds_atomic_block_start observed_source_frame={:.6} actually_rendered_count={rendered} expected_next_source_frame={rendered} lag_frames={:.6}", handle.position() * RATE as f64, rendered as f64 - handle.position() * RATE as f64);
    }

    handle.pause(instant());
    manager.backend_mut().render();
    let pause_position = handle.position();
    let first_pause = manager.backend_mut().samples();
    manager.backend_mut().render();
    let second_pause = manager.backend_mut().samples();
    let peak = first_pause
        .iter()
        .chain(second_pause.iter())
        .flat_map(|frame| frame.iter())
        .fold(0.0_f32, |peak, sample| peak.max(sample.abs()));
    println!("engine=kira probe=pause frames=512 peak={peak:.9} first_source_frame={:.6} second_source_frame={:.6} unchanged_playhead={} state={:?}", pause_position * RATE as f64, handle.position() * RATE as f64, pause_position == handle.position(), handle.state());

    handle.resume(instant());
    manager.backend_mut().render();
    let resumed = manager.backend_mut().samples();
    let resume_start = (pause_position * RATE as f64).round() as usize;
    let (observed, error) = nearest_start(&resumed[..64], source, resume_start);
    println!("engine=kira probe=resume expected_source_frame={resume_start} observed_source_frame={observed} max_error={error:.9} state={:?}", handle.state());
    report_samples("kira.resume", &resumed[..64], resume_start);
    manager.backend_mut().render();
    let steady = manager.backend_mut().samples();
    let (observed, error) = nearest_start(&steady[..64], source, resume_start + BLOCK);
    println!("engine=kira probe=resume_steady expected_source_frame={} observed_source_frame={observed} max_error={error:.9}", resume_start + BLOCK);
    report_samples("kira.resume_steady", &steady[..64], resume_start + BLOCK);

    let requested = 12_345;
    let previous_next = resume_start + BLOCK * 2;
    handle.seek_to(requested as f64 / RATE as f64);
    manager.backend_mut().render();
    let actual = manager.backend_mut().samples();
    let first_target = actual.iter().position(|frame| {
        (frame[0] - source[requested][0]).abs() <= 0.000001
            && (frame[1] - source[requested][1]).abs() <= 0.000001
    });
    let (latency, error) = (0..16)
        .map(|latency| {
            (
                latency,
                max_error(&actual[latency..latency + 64], source, requested),
            )
        })
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .expect("nonempty latency search");
    let (first_observed, first_error) = nearest_start(&actual[..1], source, previous_next);
    println!("engine=kira probe=seek requested={requested} first_observed_source_frame={first_observed} first_sample_error={first_error:.9} first_target_latency_frames={first_target:?} contiguous_target_latency_frames={latency} contiguous_64_max_error={error:.9} clock_source_frame={:.6}", handle.position() * RATE as f64);
    report_samples("kira.seek_unadjusted", &actual[..64], requested);
    report_samples(
        "kira.seek_contiguous",
        &actual[latency..latency + 64],
        requested,
    );
    for (i, frame) in actual[..6].iter().enumerate() {
        println!(
            "engine=kira probe=seek_prefix output_frame={i} left={:.9} right={:.9}",
            frame[0], frame[1]
        );
    }
}

fn benchmarks(data: &StaticSoundData) {
    for voices in [8, 64, 256] {
        let mut manager = manager(voices);
        let _handles: Vec<_> = (0..voices)
            .map(|_| manager.play(data.clone()).expect("play benchmark voice"))
            .collect();
        bench("kira", voices, || {
            manager.backend_mut().render();
            std::hint::black_box(&manager.backend_mut().output);
        });
    }
}

fn device(data: &StaticSoundData) -> Result<(), Box<dyn std::error::Error>> {
    let mut manager = AudioManager::<CpalBackend>::new(AudioManagerSettings {
        internal_buffer_size: BLOCK,
        ..Default::default()
    })?;
    let gain = 0.05_f32;
    let handle = manager.play(data.volume(20.0 * gain.log10()))?;
    let started = std::time::Instant::now();
    for _ in 0..4 {
        std::thread::sleep(Duration::from_millis(500));
        println!("engine=kira probe=device clock_type=source_position_f64_seconds_atomic_block_start wall_seconds={:.6} source_seconds={:.9} source_frame={:.6} voices=1 gain={gain}", started.elapsed().as_secs_f64(), handle.position(), handle.position() * RATE as f64);
        while let Some(error) = manager.backend_mut().pop_error() {
            println!("engine=kira probe=device_stream_error error={error:?}");
        }
    }
    println!("engine=kira probe=device_rendered_count status=UNSUPPORTED reason=CpalBackend_does_not_expose_callback_frame_count_or_DAC_timestamp");
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let source = pcm();
    let frames: Arc<[Frame]> = source
        .iter()
        .map(|frame| Frame::new(frame[0], frame[1]))
        .collect();
    let data = StaticSoundData {
        sample_rate: RATE,
        frames,
        settings: StaticSoundSettings::default(),
        slice: None,
    };
    println!(
        "engine=kira version=0.12.5 rate={RATE} block_frames={BLOCK} mode={}",
        if std::env::args().any(|arg| arg == "--device") {
            "device"
        } else {
            "offline"
        }
    );
    if std::env::args().any(|arg| arg == "--device") {
        return device(&data);
    }
    offsets(&data, &source);
    looping(&data, &source);
    transport(&data, &source);
    benchmarks(&data);
    Ok(())
}
