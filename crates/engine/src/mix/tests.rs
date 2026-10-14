use super::*;
use crate::{
    protocol::{
        BackendAudioClip, BackendControl, BackendLoopRegion, BackendRequest, BackendResult,
        BackendStage, BackendTrack, Monitor, ProtocolVersion, SessionFence,
    },
    transport::{segments, LoopRegion},
};

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u32 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1);
        (self.0 >> 32) as u32
    }
    fn unit(&mut self) -> f64 {
        f64::from(self.next()) / f64::from(u32::MAX)
    }
}
fn track(id: &str, kind: TrackKind, output: &str) -> BackendTrack {
    BackendTrack {
        id: id.into(),
        kind,
        output: output.into(),
        input: "none".into(),
        input_channel: None,
        output_channel: None,
        monitor: Monitor::Off,
        volume_db: 0.0,
        pan: 0.0,
        mute: false,
        solo: false,
        armed: false,
        sends: BTreeMap::new(),
        return_post: true,
        cue_output: None,
        cue_volume_db: 0.0,
        clips: Vec::new(),
        automation: Vec::new(),
    }
}
fn clip() -> BackendAudioClip {
    BackendAudioClip {
        id: "clip".into(),
        start_bar: 1.0,
        length_bars: 64.0,
        source_offset_bars: 0.0,
        source_id: Some("source".into()),
        gain_db: 0.0,
        fade_in_bars: 0.0,
        fade_out_bars: 0.0,
        fade_in_offset_bars: 0.0,
        fade_out_offset_bars: 0.0,
        fade_in_curve: 0.0,
        fade_out_curve: 0.0,
        fade_in_curve_position: 0.5,
        fade_out_curve_position: 0.5,
    }
}
fn project(tracks: Vec<BackendTrack>) -> BackendProject {
    BackendProject {
        bpm: 240.0,
        numerator: 4,
        denominator: 4,
        loop_region: BackendLoopRegion {
            enabled: false,
            start_bar: 1.0,
            end_bar: 2.0,
        },
        sources: Vec::new(),
        tracks,
    }
}
fn control() -> BackendControl {
    BackendControl {
        playing: true,
        recording: false,
        seek_bar: 1.0,
        seek_generation: 0,
        held_notes: Vec::new(),
        midi_velocity: 0.8,
    }
}
fn curve(x: f64, position: f64, shape: f64) -> f64 {
    let x = x.clamp(0.0, 1.0);
    let y = 0.5 + shape * 0.4;
    let ratio = position / (1.0 - position);
    let weight = ratio * ratio * (1.0 - y) / y;
    x * x / (x * x + weight * (1.0 - x) * (1.0 - x))
}
fn reference(
    project: &BackendProject,
    sources: &BTreeMap<String, Arc<AudioSource>>,
    frame: u64,
) -> [f32; 2] {
    let mut signals = vec![[0.0_f32; 2]; project.tracks.len()];
    let solo = project
        .tracks
        .iter()
        .any(|t| t.solo && t.kind == TrackKind::Audio);
    let mut output = [0.0; 2];
    for (index, track) in project.tracks.iter().enumerate() {
        let mut signal = signals[index];
        for item in &track.clips {
            let BackendClip::Audio(clip) = item else {
                continue;
            };
            let start = (clip.start_bar - 1.0).round() as u64;
            let length = clip.length_bars.round() as u64;
            if frame < start || frame >= start + length {
                continue;
            }
            let relative = frame - start;
            let source = &sources[clip.source_id.as_ref().unwrap()].pcm;
            if source.is_empty() {
                continue;
            }
            let offset = (relative as i128 + clip.source_offset_bars.round() as i128)
                .rem_euclid(source.len() as i128) as usize;
            let pcm = source[offset];
            let gain = 10.0_f64.powf(clip.gain_db / 20.0) as f32;
            let fade_in = if clip.fade_in_bars == 0.0 {
                1.0
            } else {
                curve(
                    (relative as f64 - clip.fade_in_offset_bars) / clip.fade_in_bars,
                    clip.fade_in_curve_position,
                    clip.fade_in_curve,
                ) as f32
            };
            let out_start = length as f64 - clip.fade_out_offset_bars - clip.fade_out_bars;
            let fade_out = if clip.fade_out_bars == 0.0 {
                1.0
            } else {
                (1.0 - curve(
                    (relative as f64 - out_start) / clip.fade_out_bars,
                    clip.fade_out_curve_position,
                    clip.fade_out_curve,
                )) as f32
            };
            for channel in 0..2 {
                signal[channel] += pcm[channel] * (gain * fade_in * fade_out);
            }
        }
        let pre = signal;
        let audible = !track.mute
            && (!solo || track.solo || matches!(track.kind, TrackKind::Main | TrackKind::Return));
        let angle = (track.pan + 1.0) * std::f64::consts::FRAC_PI_4;
        let volume = 10.0_f64.powf(track.volume_db / 20.0) as f32;
        signal = if audible {
            [
                signal[0] * (angle.cos() as f32 * volume),
                signal[1] * (angle.sin() as f32 * volume),
            ]
        } else {
            [0.0; 2]
        };
        if track.kind == TrackKind::Main {
            for c in 0..2 {
                output[c] += signal[c];
            }
        }
        if let Some(target) = project.tracks.iter().position(|t| t.id == track.output) {
            for c in 0..2 {
                signals[target][c] += signal[c];
            }
        }
        if audible {
            for (id, db) in &track.sends {
                let target = project.tracks.iter().position(|t| t.id == *id).unwrap();
                let values = if project.tracks[target].return_post {
                    signal
                } else {
                    pre
                };
                let gain = 10.0_f64.powf(db / 20.0) as f32;
                for c in 0..2 {
                    signals[target][c] += values[c] * gain;
                }
            }
        }
    }
    output
}

#[test]
fn randomized_render_matches_sample_reference() {
    let mut rng = Rng(0x51e9ab93);
    let source = Arc::new(AudioSource::from_pcm(
        (0..512)
            .map(|_| {
                [
                    (rng.unit() * 2.0 - 1.0) as f32,
                    (rng.unit() * 2.0 - 1.0) as f32,
                ]
            })
            .collect(),
        1,
    ));
    let sources = BTreeMap::from([("source".into(), source)]);
    for _ in 0..2000 {
        let mut tracks = Vec::new();
        for id in 0..1 + rng.next() % 5 {
            let mut track = track(&format!("track-{id}"), TrackKind::Audio, "main");
            track.volume_db = rng.unit() * 24.0 - 30.0;
            track.pan = rng.unit() * 2.0 - 1.0;
            track.mute = rng.next() % 5 == 0;
            track.solo = rng.next() % 7 == 0;
            track
                .sends
                .insert("return".into(), rng.unit() * 30.0 - 40.0);
            let mut clip = clip();
            clip.start_bar = 1.0 + f64::from(rng.next() % 12);
            clip.source_offset_bars = f64::from(rng.next() % 1200) - 600.0;
            clip.gain_db = rng.unit() * 24.0 - 30.0;
            clip.fade_in_bars = 1.0 + f64::from(rng.next() % 15);
            clip.fade_out_bars = 1.0 + f64::from(rng.next() % 15);
            clip.fade_in_offset_bars = f64::from(rng.next() % 3);
            clip.fade_out_offset_bars = f64::from(rng.next() % 3);
            clip.fade_in_curve = rng.unit() * 2.0 - 1.0;
            clip.fade_out_curve = rng.unit() * 2.0 - 1.0;
            clip.fade_in_curve_position = 0.1 + rng.unit() * 0.8;
            clip.fade_out_curve_position = 0.1 + rng.unit() * 0.8;
            track.clips.push(BackendClip::Audio(clip));
            tracks.push(track);
        }
        let mut return_track = track("return", TrackKind::Return, "main");
        return_track.return_post = rng.next() % 2 == 0;
        return_track.volume_db = -6.0;
        tracks.push(return_track);
        tracks.push(track("main", TrackKind::Main, "external"));
        let project = project(tracks);
        let clock = TransportClock::new(1, 1.0).unwrap();
        let mut mixer = Mixer::compile(&project, clock, &sources).unwrap();
        let mut transport = Transport::from_control(clock, &project, &control());
        let mut actual = vec![[0.0; 2]; 96];
        mixer.render(&mut transport, 96, |i, value| actual[i] = value);
        for (frame, actual) in actual.into_iter().enumerate() {
            let expected = reference(&project, &sources, frame as u64);
            assert_eq!(actual, expected, "frame={frame}");
        }
    }
}

#[test]
fn randomized_seek_loop_pause_positions_and_first_samples() {
    let pcm: Vec<_> = (0..512).map(|i| [i as f32 / 512.0; 2]).collect();
    let sources = BTreeMap::from([("source".into(), Arc::new(AudioSource::from_pcm(pcm, 1)))]);
    let mut audio = track("audio", TrackKind::Audio, "main");
    let mut clip = clip();
    clip.length_bars = 512.0;
    audio.clips.push(BackendClip::Audio(clip));
    let project = project(vec![audio, track("main", TrackKind::Main, "external")]);
    let clock = TransportClock::new(1, 1.0).unwrap();
    let mut mixer = Mixer::compile(&project, clock, &sources).unwrap();
    let mut transport = Transport::from_control(clock, &project, &control());
    let mut rng = Rng(0xab5e44);
    let mut position = 0;
    for _ in 0..10000 {
        if rng.next() % 3 == 0 {
            position = u64::from(rng.next() % 300);
            transport.seek(position);
        }
        transport.playing = rng.next() % 4 != 0;
        transport.loop_region = if rng.next() % 2 == 0 {
            LoopRegion::new(20, 37)
        } else {
            None
        };
        let frames = rng.next() % 65;
        let mut actual = vec![[0.0; 2]; frames as usize];
        let expected_ranges = if transport.playing {
            segments(position, frames, transport.loop_region)
                .flatten()
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        mixer.render(&mut transport, frames, |i, value| actual[i] = value);
        for (i, sample) in actual.into_iter().enumerate() {
            let expected = expected_ranges
                .get(i)
                .map_or([0.0; 2], |&frame| reference(&project, &sources, frame));
            assert_eq!(sample, expected);
        }
        if transport.playing && frames != 0 {
            for _ in 0..frames {
                if let Some(region) = transport.loop_region {
                    if position >= region.end_frame() {
                        position = region.start_frame()
                            + (position - region.start_frame())
                                % (region.end_frame() - region.start_frame());
                    }
                }
                position += 1;
                if let Some(region) = transport.loop_region {
                    if position == region.end_frame() {
                        position = region.start_frame();
                    }
                }
            }
        }
        assert_eq!(transport.position_frame, position);
    }
}

#[test]
fn generation_fence_rejects_old_seek_without_changing_state() {
    let mut fence = SessionFence::new();
    let mut request = BackendRequest {
        protocol_version: ProtocolVersion,
        session_id: "property".into(),
        sequence: 0,
        base_revision: 0,
        revision: 0,
        stage: BackendStage::Open,
        edit_id: None,
        state: crate::protocol::BackendState {
            project: project(vec![]),
            control: control(),
        },
    };
    assert!(matches!(
        fence.apply(&request),
        BackendResult::Accepted { .. }
    ));
    let mut rng = Rng(0x938fb);
    for generation in 1..1000 {
        request.stage = BackendStage::Transport;
        request.sequence += 1;
        request.state.control.seek_generation = generation;
        request.state.control.seek_bar = 1.0 + rng.unit() * 100.0;
        assert!(matches!(
            fence.apply(&request),
            BackendResult::Accepted { .. }
        ));
        let expected = fence.state().unwrap().clone();
        request.sequence += 1;
        request.state.control.seek_generation = generation - 1;
        request.state.control.seek_bar = 999.0;
        assert!(matches!(
            fence.apply(&request),
            BackendResult::Rejected { .. }
        ));
        assert_eq!(fence.state(), Some(&expected));
    }
}

#[test]
fn randomized_peak_queries_match_brute_force() {
    let mut rng = Rng(0x5548d);
    let pcm: Vec<_> = (0..3017)
        .map(|_| {
            [
                (rng.unit() * 2.0 - 1.0) as f32,
                (rng.unit() * 2.0 - 1.0) as f32,
            ]
        })
        .collect();
    let source = AudioSource::from_pcm(pcm.clone(), 48000);
    for _ in 0..5000 {
        let start = rng.next() as usize % pcm.len();
        let end = start + 1 + rng.next() as usize % (pcm.len() - start);
        let pixels = 1 + rng.next() as usize % 128;
        let actual = source.read_peaks(start as u64, end as u64, pixels).unwrap();
        for c in 0..2 {
            for p in 0..pixels {
                let left = start + (end - start) * p / pixels;
                let right = start + (end - start) * (p + 1) / pixels;
                let expected = if left == right {
                    [0.0; 2]
                } else {
                    [
                        pcm[left..right]
                            .iter()
                            .map(|s| s[c])
                            .fold(f32::INFINITY, f32::min),
                        pcm[left..right]
                            .iter()
                            .map(|s| s[c])
                            .fold(f32::NEG_INFINITY, f32::max),
                    ]
                };
                assert_eq!(
                    &actual[(c * pixels + p) * 2..(c * pixels + p + 1) * 2],
                    &expected
                );
            }
        }
    }
}

#[test]
fn signed_source_windows_cover_arbitrary_lengths_and_empty_media() {
    let mut rng = Rng(0x991edb);
    for case in 0..2000 {
        let length = if case == 0 {
            0
        } else {
            rng.next() as usize % 257
        };
        let pcm = (0..length)
            .map(|index| [index as f32 / 257.0, -(index as f32) / 257.0])
            .collect();
        let sources = BTreeMap::from([("source".into(), Arc::new(AudioSource::from_pcm(pcm, 1)))]);
        let mut audio = track("audio", TrackKind::Audio, "main");
        let mut clip = clip();
        clip.length_bars = f64::from(1 + rng.next() % 600);
        clip.source_offset_bars = match case % 4 {
            0 => -(length as f64) * f64::from(rng.next() % 20),
            1 => length as f64 * f64::from(rng.next() % 20),
            _ => f64::from(rng.next() % 4000) - 2000.0,
        };
        audio.clips.push(BackendClip::Audio(clip));
        let project = project(vec![audio, track("main", TrackKind::Main, "external")]);
        let clock = TransportClock::new(1, 1.0).unwrap();
        let mut transport = Transport::from_control(clock, &project, &control());
        let mut mixer = Mixer::compile(&project, clock, &sources).unwrap();
        mixer.render(&mut transport, 640, |frame, sample| {
            assert_eq!(sample, reference(&project, &sources, frame as u64))
        });
    }
}
