//! Control-thread compiled routing. The render path only reads PCM and mutates preallocated buffers.

use std::{collections::BTreeMap, sync::Arc};

use crate::{
    assets::AudioSource,
    protocol::{BackendClip, BackendProject, TrackKind},
    transport::{bar_to_frame, source_offset_frame, Transport, TransportClock},
};

mod fade;
#[cfg(test)]
mod tests;

#[derive(Clone)]
struct Clip {
    source: Arc<AudioSource>,
    start: u64,
    end: u64,
    offset: u64,
    gain: f32,
    fade_in: fade::Fade,
    fade_out: fade::Fade,
}

#[derive(Clone)]
struct Track {
    clips: Vec<Clip>,
    gain: [f32; 2],
    audible: bool,
    main: bool,
    output: Option<usize>,
    sends: Vec<(usize, f32, bool)>,
}

#[derive(Clone)]
pub struct Mixer {
    tracks: Vec<Track>,
    order: Vec<usize>,
    scratch: Vec<[f32; 2]>,
    pub peaks: Vec<[f32; 2]>,
    pub rms: Vec<[f32; 2]>,
}

pub fn db_gain(db: f64) -> f32 {
    10.0_f64.powf(db / 20.0) as f32
}

pub fn pan_gain(pan: f64) -> [f32; 2] {
    let angle = (pan.clamp(-1.0, 1.0) + 1.0) * std::f64::consts::FRAC_PI_4;
    [angle.cos() as f32, angle.sin() as f32]
}

impl Mixer {
    pub fn compile(
        project: &BackendProject,
        clock: TransportClock,
        sources: &BTreeMap<String, Arc<AudioSource>>,
    ) -> Result<Self, String> {
        let indices: BTreeMap<_, _> = project
            .tracks
            .iter()
            .enumerate()
            .map(|(i, t)| (t.id.as_str(), i))
            .collect();
        if indices.len() != project.tracks.len() {
            return Err("duplicate track id".into());
        }
        let solo = project
            .tracks
            .iter()
            .any(|t| t.solo && !matches!(t.kind, TrackKind::Main | TrackKind::Return));
        let frames = |bars: f64| bar_to_frame(clock, bars + 1.0);
        let mut tracks = Vec::with_capacity(project.tracks.len());
        for track in &project.tracks {
            if !db_gain(track.volume_db).is_finite() || !track.pan.is_finite() {
                return Err("non-finite mixer control".into());
            }
            let output = if matches!(track.output.as_str(), "none" | "external")
                || track.kind == TrackKind::Main
            {
                None
            } else {
                Some(
                    *indices
                        .get(track.output.as_str())
                        .ok_or("unknown output track")?,
                )
            };
            let mut sends = Vec::new();
            for (id, db) in &track.sends {
                let destination = *indices.get(id.as_str()).ok_or("unknown send track")?;
                if project.tracks[destination].kind != TrackKind::Return
                    || !db_gain(*db).is_finite()
                {
                    return Err("invalid return send".into());
                }
                sends.push((
                    destination,
                    db_gain(*db),
                    project.tracks[destination].return_post,
                ));
            }
            let mut clips = Vec::new();
            for clip in &track.clips {
                let BackendClip::Audio(clip) = clip else {
                    continue;
                };
                if [
                    clip.start_bar,
                    clip.length_bars,
                    clip.source_offset_bars,
                    clip.gain_db,
                    clip.fade_in_bars,
                    clip.fade_out_bars,
                    clip.fade_in_offset_bars,
                    clip.fade_out_offset_bars,
                    clip.fade_in_curve,
                    clip.fade_out_curve,
                    clip.fade_in_curve_position,
                    clip.fade_out_curve_position,
                ]
                .iter()
                .any(|v| !v.is_finite())
                    || clip.start_bar < 1.0
                    || clip.length_bars <= 0.0
                    || !db_gain(clip.gain_db).is_finite()
                {
                    return Err("invalid audio clip".into());
                }
                let Some(id) = &clip.source_id else { continue };
                let source = sources.get(id).ok_or("missing audio source")?.clone();
                let Some(offset) =
                    source_offset_frame(clock, clip.source_offset_bars, source.pcm.len() as u64)
                else {
                    continue;
                };
                let start = bar_to_frame(clock, clip.start_bar);
                let length = frames(clip.length_bars);
                clips.push(Clip {
                    source,
                    start,
                    end: start.saturating_add(length),
                    offset,
                    gain: db_gain(clip.gain_db),
                    fade_in: fade::Fade::new(
                        frames(clip.fade_in_offset_bars),
                        frames(clip.fade_in_bars),
                        clip.fade_in_curve_position,
                        clip.fade_in_curve,
                        false,
                    ),
                    fade_out: fade::Fade::new(
                        length
                            .saturating_sub(frames(clip.fade_out_offset_bars))
                            .saturating_sub(frames(clip.fade_out_bars)),
                        frames(clip.fade_out_bars),
                        clip.fade_out_curve_position,
                        clip.fade_out_curve,
                        true,
                    ),
                });
            }
            let pan = pan_gain(track.pan);
            let volume = db_gain(track.volume_db);
            let solo_allowed = !solo
                || matches!(
                    track.kind,
                    TrackKind::Return | TrackKind::Main | TrackKind::Group
                )
                || std::iter::successors(indices.get(track.id.as_str()).copied(), |&index| {
                    indices.get(project.tracks[index].output.as_str()).copied()
                })
                .take(project.tracks.len())
                .any(|index| project.tracks[index].solo);
            tracks.push(Track {
                clips,
                gain: [pan[0] * volume, pan[1] * volume],
                audible: !track.mute && solo_allowed,
                main: track.kind == TrackKind::Main,
                output,
                sends,
            });
        }
        let mut indegree = vec![0; tracks.len()];
        for track in &tracks {
            for target in track
                .output
                .into_iter()
                .chain(track.sends.iter().map(|s| s.0))
            {
                indegree[target] += 1;
            }
        }
        let mut order = Vec::with_capacity(tracks.len());
        while order.len() < tracks.len() {
            let Some(index) = indegree.iter().position(|degree| *degree == 0) else {
                return Err("cyclic audio routing".into());
            };
            indegree[index] = usize::MAX;
            order.push(index);
            for target in tracks[index]
                .output
                .into_iter()
                .chain(tracks[index].sends.iter().map(|s| s.0))
            {
                indegree[target] -= 1;
            }
        }
        let count = tracks.len();
        Ok(Self {
            tracks,
            order,
            scratch: vec![[0.0; 2]; count],
            peaks: vec![[0.0; 2]; count],
            rms: vec![[0.0; 2]; count],
        })
    }

    fn sample(&mut self, frame: u64) -> [f32; 2] {
        self.scratch.fill([0.0; 2]);
        let mut main = [0.0; 2];
        for &index in &self.order {
            let track = &self.tracks[index];
            let mut pre = self.scratch[index];
            for clip in &track.clips {
                if frame < clip.start || frame >= clip.end {
                    continue;
                }
                let relative = frame - clip.start;
                let pcm = &clip.source.pcm[((relative % clip.source.pcm.len() as u64 + clip.offset)
                    % clip.source.pcm.len() as u64)
                    as usize];
                let gain = clip.gain * clip.fade_in.gain(relative) * clip.fade_out.gain(relative);
                for channel in 0..2 {
                    pre[channel] += pcm[channel] * gain;
                }
            }
            let post = if track.audible {
                [pre[0] * track.gain[0], pre[1] * track.gain[1]]
            } else {
                [0.0; 2]
            };
            for channel in 0..2 {
                self.peaks[index][channel] = self.peaks[index][channel].max(post[channel].abs());
                self.rms[index][channel] += post[channel] * post[channel];
                if track.main {
                    main[channel] += post[channel];
                }
            }
            if let Some(target) = track.output {
                for (destination, sample) in self.scratch[target].iter_mut().zip(post) {
                    *destination += sample;
                }
            }
            if track.audible {
                for &(target, gain, post_fader) in &track.sends {
                    let signal = if post_fader { post } else { pre };
                    for (destination, sample) in self.scratch[target].iter_mut().zip(signal) {
                        *destination += sample * gain;
                    }
                }
            }
        }
        main
    }

    pub fn render(
        &mut self,
        transport: &mut Transport,
        frames: u32,
        mut output: impl FnMut(usize, [f32; 2]),
    ) {
        self.peaks.fill([0.0; 2]);
        self.rms.fill([0.0; 2]);
        let mut offset = 0;
        for range in transport.advance(frames).segments {
            for frame in range {
                output(offset, self.sample(frame));
                offset += 1;
            }
        }
        for frame in offset..frames as usize {
            output(frame, [0.0; 2]);
        }
        if frames > 0 {
            for track in &mut self.rms {
                for sample in track {
                    *sample = (*sample / frames as f32).sqrt();
                }
            }
        }
    }
}
