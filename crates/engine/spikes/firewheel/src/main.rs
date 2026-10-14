use std::{
    num::{NonZeroU32, NonZeroUsize},
    time::{Duration, Instant},
};

use audioadapter_buffers::direct::InterleavedSlice;
use firewheel::{
    backend::BackendProcessInfo,
    collector::ArcGc,
    node::{NodeID, StreamStatus},
    nodes::sampler::{PlayFrom, RepeatMode, SamplerConfig, SamplerNode, SamplerState},
    processor::FirewheelProcessor,
    sample_resource::{InterleavedResourceF32, SampleResource, SampleResourceInfo},
    ActivateInfo, FirewheelConfig, FirewheelContext, Volume,
};
use spike_common::{bench, duration, pcm, report_samples, FRAMES, RATE};

const BLOCK: usize = 256;
type Sample = ArcGc<dyn SampleResource + Send + Sync>;

fn sample(source: &[[f32; 2]]) -> Sample {
    InterleavedResourceF32 {
        data: source.as_flattened().to_vec(),
        channels: NonZeroUsize::new(2).unwrap(),
        sample_rate: NonZeroU32::new(RATE),
    }
    .into_dyn_resource()
}

struct RegionResource {
    source: Sample,
    start: u64,
    end: u64,
}

impl SampleResourceInfo for RegionResource {
    fn num_channels(&self) -> NonZeroUsize {
        self.source.num_channels()
    }

    fn len_frames(&self) -> u64 {
        self.end - self.start
    }

    fn sample_rate(&self) -> Option<NonZeroU32> {
        self.source.sample_rate()
    }
}

impl SampleResource for RegionResource {
    fn fill_buffers(
        &self,
        out_buffer: &mut [&mut [f32]],
        out_buffer_range: std::ops::Range<usize>,
        start_frame: u64,
    ) -> usize {
        let frames = self
            .len_frames()
            .saturating_sub(start_frame)
            .min(out_buffer_range.len() as u64) as usize;
        if frames == 0 {
            return 0;
        }
        self.source.fill_buffers(
            out_buffer,
            out_buffer_range.start..out_buffer_range.start + frames,
            self.start + start_frame,
        )
    }
}

fn graph(
    sample: &Sample,
    voices: usize,
    offset: usize,
    repeat: bool,
    gain: f32,
) -> (FirewheelContext, Vec<(NodeID, SamplerNode)>) {
    let mut context = FirewheelContext::new(FirewheelConfig {
        declick_seconds: 0.0,
        initial_node_capacity: (voices + 2) as u32,
        initial_edge_capacity: (voices * 2) as u32,
        initial_event_group_capacity: (voices * 3).max(128) as u32,
        immediate_event_capacity: (voices * 3).max(512),
        ..Default::default()
    });
    let mut nodes = Vec::with_capacity(voices);
    for _ in 0..voices {
        let mut sampler = SamplerNode {
            volume: Volume::Linear(gain.sqrt()),
            repeat_mode: if repeat {
                RepeatMode::RepeatEndlessly
            } else {
                RepeatMode::PlayOnce
            },
            crossfade_on_seek: false,
            ..Default::default()
        };
        sampler.start_from(PlayFrom::Frames(offset as u64));
        let id = context
            .add_node(
                sampler,
                Some(SamplerConfig {
                    num_declickers: 0,
                    ..Default::default()
                }),
            )
            .unwrap();
        context
            .connect(id, context.graph_out_node_id(), &[(0, 0), (1, 1)], false)
            .unwrap();
        context.queue_event_for(id, SamplerNode::set_dyn_sample_event(sample.clone()));
        nodes.push((id, sampler));
    }
    (context, nodes)
}

struct Offline {
    processor: FirewheelProcessor,
    context: FirewheelContext,
    nodes: Vec<(NodeID, SamplerNode)>,
    output: [[f32; 2]; BLOCK],
    rendered: usize,
}

impl Offline {
    fn new(sample: &Sample, voices: usize, offset: usize, repeat: bool) -> Self {
        let (mut context, nodes) = graph(sample, voices, offset, repeat, 1.0);
        let processor = context
            .activate(ActivateInfo {
                sample_rate: NonZeroU32::new(RATE).unwrap(),
                max_block_frames: NonZeroU32::new(BLOCK as u32).unwrap(),
                num_stream_in_channels: 0,
                num_stream_out_channels: 2,
                input_to_output_latency_seconds: 0.0,
            })
            .unwrap();
        context.update().unwrap();
        Self {
            processor,
            context,
            nodes,
            output: [[0.0; 2]; BLOCK],
            rendered: 0,
        }
    }

    fn render(&mut self) {
        self.processor.process(
            &InterleavedSlice::new(&[], 0, 0).unwrap(),
            &mut InterleavedSlice::new_mut(self.output.as_flattened_mut(), 2, BLOCK).unwrap(),
            BackendProcessInfo {
                frames: BLOCK,
                process_timestamp: None,
                duration_since_stream_start: duration(self.rendered),
                input_stream_status: StreamStatus::empty(),
                output_stream_status: StreamStatus::empty(),
                dropped_frames: 0,
                process_to_playback_delay: None,
            },
        );
        self.rendered += BLOCK;
    }

    fn playhead(&self) -> i64 {
        self.context
            .node_state::<SamplerState>(self.nodes[0].0)
            .unwrap()
            .playhead_frames()
            .0
    }

    fn sync_control(&mut self) {
        let (id, node) = &self.nodes[0];
        self.context
            .queue_event_for(*id, node.sync_play_from_event());
        self.context.queue_event_for(*id, node.sync_play_event());
        self.context.update().unwrap();
    }

    fn clock(&self, stage: &str, expected_source: usize) {
        println!("firewheel clock stage={stage} type=rendered_sample_counter graph_frames={} rendered_frames={} source_frames={} expected_source_frames={expected_source} corrected=false",
            self.context.audio_clock().samples.0, self.rendered, self.playhead());
    }
}

fn peak(samples: &[[f32; 2]]) -> f32 {
    samples
        .iter()
        .flatten()
        .fold(0.0_f32, |peak, x| peak.max(x.abs()))
}

fn matching_latency(actual: &[[f32; 2]], source: &[[f32; 2]], offset: usize) -> Option<usize> {
    (0..64).find(|&latency| {
        actual[latency..latency + 32]
            .iter()
            .zip(&source[offset + latency..offset + latency + 32])
            .all(|(a, b)| a.iter().zip(b).all(|(a, b)| (a - b).abs() <= 1e-6))
    })
}

fn offline() {
    let source = pcm();
    let resource = sample(&source);
    println!("firewheel config mode=offline backend=FirewheelProcessor block_frames={BLOCK} sample_rate={RATE} gain=1 speed=1 declick_requested_seconds=0 native_min_declick_frames=1 crossfade_on_seek=false stop_declickers=0");
    for offset in [0, 12_345, 144_001] {
        let mut probe = Offline::new(&resource, 1, offset, false);
        probe.render();
        report_samples(
            &format!("firewheel offset requested={offset}"),
            &probe.output[..64],
            offset,
        );
        let latency = matching_latency(&probe.output, &source, offset);
        println!("firewheel offset requested={offset} observed_source_after_block={} expected_source_after_block={} first_unmodified_output_frame={latency:?} actual_first_left={} expected_first_left={}",
            probe.playhead(), offset + BLOCK, probe.output[0][0], source[offset][0]);
        report_samples(
            &format!("firewheel offset_post_declick requested={offset}"),
            &probe.output[1..65],
            offset + 1,
        );
        probe.clock("offset", offset + BLOCK);
    }

    println!("firewheel loop_region status=UNSUPPORTED start=4800 end=9600 reason=SamplerNode_has_no_loop_start_end_parameters_native_repeat_is_whole_resource_only");
    let mut looping = Offline::new(&resource, 1, FRAMES - 32, true);
    looping.render();
    let loop_error = looping.output[1..]
        .iter()
        .enumerate()
        .fold(0.0_f32, |error, (i, actual)| {
            let expected = source[(FRAMES - 32 + i + 1) % FRAMES];
            error
                .max((actual[0] - expected[0]).abs())
                .max((actual[1] - expected[1]).abs())
        });
    println!("firewheel loop_whole_asset wrap_output_frame=32 before_source={} after_source=0 max_error_excluding_initial_declick={loop_error:.9} before_actual={:?} before_expected={:?} after_actual={:?} after_expected={:?} gap_or_duplicate={}",
        FRAMES - 1, looping.output[31], source[FRAMES - 1], looping.output[32], source[0], loop_error > 1e-6);
    looping.clock("whole_asset_loop", BLOCK - 32);

    let region: Sample = RegionResource {
        source: resource.clone(),
        start: 4_800,
        end: 9_600,
    }
    .into();
    let mut region_loop = Offline::new(&region, 1, 4_800 - 32, true);
    let mut region_output = Vec::with_capacity(38 * BLOCK);
    for _ in 0..38 {
        region_loop.render();
        region_output.extend_from_slice(&region_loop.output);
    }
    let expected_region = |frame: usize| source[4_800 + (4_800 - 32 + frame) % 4_800];
    let region_error =
        region_output
            .iter()
            .enumerate()
            .skip(1)
            .fold(0.0_f32, |error, (frame, actual)| {
                let expected = expected_region(frame);
                error
                    .max((actual[0] - expected[0]).abs())
                    .max((actual[1] - expected[1]).abs())
            });
    println!("firewheel loop_region_adapter=SampleResource_view native_loop_parameters=false zero_copy_pcm=true start=4800 end=9600 native_sampler_repeat=whole_resource rendered_frames={} max_error_excluding_initial_declick={region_error:.9}", region_output.len());
    for (seam, output_frame) in [32, 4_832, 9_632].into_iter().enumerate() {
        let seam_error = (output_frame - 4..output_frame + 64).fold(0.0_f32, |error, frame| {
            let actual = region_output[frame];
            let expected = expected_region(frame);
            error
                .max((actual[0] - expected[0]).abs())
                .max((actual[1] - expected[1]).abs())
        });
        println!("firewheel loop_region_adapter_seam seam={} output_frame={output_frame} before_source=9599 after_source=4800 max_error={seam_error:.9} gap_or_duplicate={} before_actual={:?} before_expected={:?} after_actual={:?} after_expected={:?}",
            seam + 1, seam_error > 1e-6, region_output[output_frame - 1], source[9_599], region_output[output_frame], source[4_800]);
    }
    region_loop.clock(
        "region_view_loop_relative",
        (4_800 - 32 + region_output.len()) % 4_800,
    );

    let mut probe = Offline::new(&resource, 1, 0, false);
    probe.render();
    let before_pause = probe.playhead();
    probe.nodes[0].1.pause();
    probe.sync_control();
    probe.render();
    let transition_head = probe.playhead();
    let transition_peak = peak(&probe.output);
    probe.render();
    let stable_head = probe.playhead();
    println!("firewheel pause before_source={before_pause} transition_source={transition_head} steady_source={stable_head} transition_peak={transition_peak:.9} steady_peak={:.9} immediate_playhead_unchanged={} steady_playhead_unchanged={} reason=native_pause_fade_consumes_one_render_block_even_with_one_frame_declick",
        peak(&probe.output), before_pause == transition_head, transition_head == stable_head);
    probe.clock("paused", stable_head as usize);
    probe.nodes[0].1.resume();
    probe.sync_control();
    probe.render();
    report_samples(
        "firewheel resume first64",
        &probe.output[..64],
        stable_head as usize,
    );
    report_samples(
        "firewheel resume_post_declick",
        &probe.output[1..65],
        stable_head as usize + 1,
    );
    println!("firewheel resume expected_start={stable_head} observed_source_after_block={} first_unmodified_output_frame={:?}",
        probe.playhead(), matching_latency(&probe.output, &source, stable_head as usize));
    probe.clock("resumed", stable_head as usize + BLOCK);

    probe.nodes[0].1.start_from(PlayFrom::Frames(12_345));
    probe.sync_control();
    probe.render();
    report_samples(
        "firewheel seek requested=12345 first64",
        &probe.output[..64],
        12_345,
    );
    report_samples("firewheel seek_post_declick", &probe.output[1..65], 12_346);
    let latency = matching_latency(&probe.output, &source, 12_345);
    println!("firewheel seek requested=12345 command_application_latency_frames=0 first_unmodified_output_frame={latency:?} first_unmodified_source_frame={:?} observed_source_after_block={} actual_first={:?} expected_first={:?} reason=native_nonzero_seek_always_fades_in_for_at_least_one_frame",
        latency.map(|n| 12_345 + n), probe.playhead(), probe.output[0], source[12_345]);
    probe.clock("seeked", 12_345 + BLOCK);

    for voices in [8, 64, 256] {
        let mut probe = Offline::new(&resource, voices, 0, true);
        bench("firewheel", voices, || {
            probe.render();
            std::hint::black_box(&probe.output);
        });
        println!("firewheel benchmark voices={voices} decoded_assets=1 rendered_frames={} source_frame={} graph_frames={} metric=cpu_time_and_wall_time_over_audio_budget",
            probe.rendered, probe.playhead(), probe.context.audio_clock().samples.0);
    }
}

fn device() -> Result<(), Box<dyn std::error::Error>> {
    let source = pcm();
    let resource = sample(&source);
    let (mut context, nodes) = graph(&resource, 1, 0, true, 0.05);
    let mut config = firewheel::cpal::CpalConfig::default();
    config.output.desired_sample_rate = Some(RATE);
    config.output.desired_block_frames = Some(BLOCK as u32);
    let mut stream = firewheel::cpal::CpalStream::new(&mut context, config)?;
    context.update()?;
    println!("firewheel device status=STARTED backend=cpal sample_rate={} max_block_frames={} voices=1 total_gain=0.05 peak_bound=0.025",
        stream.info().sample_rate, stream.info().max_block_frames);
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(2) {
        context.update()?;
        for error in stream.poll_status() {
            eprintln!("firewheel device status=STREAM_ERROR error={error:?}");
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let clock = context.audio_clock();
    let state = context
        .node_state::<SamplerState>(nodes[0].0)
        .unwrap()
        .current_processor_state();
    println!("firewheel device status=FINISHED wall_seconds={:.6} clock_type=rendered_sample_counter graph_frames={} source_frames={} source_rate={} device_rate={} playback_state={:?} output_stream_ok={}",
        start.elapsed().as_secs_f64(), clock.samples.0, state.playhead_frames, RATE,
        stream.info().sample_rate, state.playback_state, stream.output_stream_ok());
    drop(stream);
    Ok(())
}

fn main() {
    match std::env::args().nth(1).as_deref() {
        None => offline(),
        Some("--device") => {
            if let Err(error) = device() {
                eprintln!("firewheel device status=ERROR error={error:?}");
                std::process::exit(1);
            }
        }
        Some(argument) => {
            eprintln!("unknown argument: {argument}; usage: spike-firewheel [--device]");
            std::process::exit(2);
        }
    }
}
