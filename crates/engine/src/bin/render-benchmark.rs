use firewheel::cpal::cpal::{
    self,
    traits::{DeviceTrait, HostTrait},
};
use serde_json::json;
use std::{collections::BTreeMap, sync::Arc, time::Instant};
use zoeydaw_engine::{
    assets::AudioSource,
    mix::Mixer,
    protocol::{BackendControl, BackendProject},
    transport::{Transport, TransportClock},
};

fn main() {
    const RATE: u32 = 48000;
    const TRACKS: usize = 64;
    const SECONDS: u32 = 10;
    const BLOCK: u32 = 256;
    if let Some(device) = cpal::default_host().default_output_device() {
        println!(
            "default_output_device={device} default_output_config={:?}",
            device.default_output_config()
        );
    }
    let pcm = (0..RATE * SECONDS)
        .map(|frame| [0.2 * (std::f32::consts::TAU * 440.0 * frame as f32 / RATE as f32).sin(); 2])
        .collect();
    let sources = BTreeMap::from([("sine".into(), Arc::new(AudioSource::from_pcm(pcm, RATE)))]);
    let mut tracks = Vec::new();
    for index in 0..=TRACKS {
        let main = index == TRACKS;
        tracks.push(json!({ "id": if main { "main".to_string() } else { format!("audio-{index}") }, "kind": if main { "main" } else { "audio" }, "output": if main { "external" } else { "main" }, "input":"none", "inputChannel":null, "outputChannel":null, "monitor":"off", "volumeDb":-40.0, "pan":0.0, "mute":false, "solo":false, "armed":false, "sends":{}, "returnPost":true, "cueOutput":null, "cueVolumeDb":0.0, "automation":[], "clips": if main { json!([]) } else { json!([{"id":format!("clip-{index}"), "kind":"audio", "startBar":1.0,"lengthBars":8.0,"sourceOffsetBars":0.0,"sourceId":"sine","gainDb":0.0,"fadeInBars":0.1,"fadeOutBars":0.1,"fadeInOffsetBars":0.0,"fadeOutOffsetBars":0.0,"fadeInCurve":0.35,"fadeOutCurve":-0.35,"fadeInCurvePosition":0.5,"fadeOutCurvePosition":0.5}]) } }));
    }
    let project: BackendProject = serde_json::from_value(json!({"bpm":120.0,"numerator":4,"denominator":4,"loop":{"enabled":false,"startBar":1.0,"endBar":9.0},"sources":[],"tracks":tracks})).unwrap();
    let control: BackendControl = serde_json::from_value(json!({"playing":true,"recording":false,"seekBar":1.0,"seekGeneration":0,"heldNotes":[],"midiVelocity":0.8})).unwrap();
    let clock = TransportClock::new(RATE, 0.5).unwrap();
    let mut mixer = Mixer::compile(&project, clock, &sources).unwrap();
    let mut transport = Transport::from_control(clock, &project, &control);
    let mut maximum = 0.0_f64;
    let start = Instant::now();
    let mut remaining = RATE * SECONDS;
    while remaining > 0 {
        let count = remaining.min(BLOCK);
        let block = Instant::now();
        mixer.render(&mut transport, count, |_, sample| {
            std::hint::black_box(sample);
        });
        maximum = maximum.max(block.elapsed().as_secs_f64());
        remaining -= count;
    }
    let wall = start.elapsed().as_secs_f64();
    println!("tracks={TRACKS} seconds={SECONDS} sample_rate={RATE} block_frames={BLOCK} wall_seconds={wall:.6} average_budget_ratio={:.6} maximum_block_seconds={maximum:.6} maximum_budget_ratio={:.6}", wall / f64::from(SECONDS), maximum / (f64::from(BLOCK) / f64::from(RATE)));
}
