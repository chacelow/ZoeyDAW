use crate::{
    mix::Mixer,
    protocol::BackendTelemetry,
    transport::{bar_to_frame, frame_to_bar, Transport},
};
use firewheel::{
    channel_config::{ChannelConfig, ChannelCount},
    node::{
        AudioNode, AudioNodeInfo, AudioNodeProcessor, ConstructProcessorContext, EmptyConfig,
        NodeError, ProcBuffers, ProcExtra, ProcInfo, ProcStreamCtx, ProcessStatus,
    },
    StreamInfo,
};
use std::{
    cell::RefCell,
    sync::{
        atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering},
        Arc,
    },
};
use triple_buffer::Output;

pub(crate) struct Meter {
    peak: [AtomicU32; 2],
    rms: [AtomicU32; 2],
}

pub(crate) struct Snapshot {
    version: AtomicU64,
    frame: AtomicU64,
    latency: AtomicU64,
    meters: Vec<Meter>,
}

impl Snapshot {
    pub fn new(count: usize) -> Self {
        Self {
            version: AtomicU64::new(0),
            frame: AtomicU64::new(0),
            latency: AtomicU64::new(u64::MAX),
            meters: (0..count)
                .map(|_| Meter {
                    peak: [const { AtomicU32::new(0) }; 2],
                    rms: [const { AtomicU32::new(0) }; 2],
                })
                .collect(),
        }
    }

    pub fn telemetry(
        &self,
        template: BackendTelemetry,
        transport: &Transport,
        ids: &[String],
    ) -> Option<BackendTelemetry> {
        let before = self.version.load(Ordering::Acquire);
        if before == 0 || before & 1 != 0 {
            return None;
        }
        let mut result = template;
        let mut transport = transport.clone();
        transport.position_frame = self.frame.load(Ordering::Relaxed);
        result.clock = transport.to_backend_clock();
        let latency = self.latency.load(Ordering::Relaxed);
        result.output_latency_frames = (latency != u64::MAX).then_some(latency);
        for (id, meter) in ids.iter().zip(&self.meters) {
            result.levels.insert(
                id.clone(),
                meter
                    .peak
                    .each_ref()
                    .map(|p| amplitude_db(f32::from_bits(p.load(Ordering::Relaxed)))),
            );
        }
        std::sync::atomic::fence(Ordering::Acquire);
        (before == self.version.load(Ordering::Relaxed)).then_some(result)
    }
}

pub fn amplitude_db(amplitude: f32) -> f64 {
    if amplitude > 0.0 && amplitude.is_finite() {
        (20.0 * f64::from(amplitude).log10()).max(-120.0)
    } else {
        -120.0
    }
}

#[derive(Clone)]
pub(crate) struct Plan {
    pub mixer: Mixer,
    pub transport: Transport,
    pub seek_generation: u64,
    pub snapshot: Arc<Snapshot>,
}

pub(crate) struct TimelineNode {
    pub receiver: RefCell<Option<Output<Option<Plan>>>>,
    pub fault: Arc<AtomicBool>,
}

impl AudioNode for TimelineNode {
    type Configuration = EmptyConfig;
    fn info(&self, _: &EmptyConfig) -> Result<AudioNodeInfo, NodeError> {
        Ok(AudioNodeInfo::new()
            .debug_name("zoeydaw timeline")
            .channel_config(ChannelConfig {
                num_inputs: ChannelCount::ZERO,
                num_outputs: ChannelCount::STEREO,
            }))
    }
    fn construct_processor(
        &self,
        _: &EmptyConfig,
        cx: ConstructProcessorContext,
    ) -> Result<impl AudioNodeProcessor, NodeError> {
        Ok(TimelineProcessor {
            receiver: self
                .receiver
                .borrow_mut()
                .take()
                .ok_or_else(|| std::io::Error::other("timeline already constructed"))?,
            transport: None,
            generation: 0,
            fault: self.fault.clone(),
            sample_rate: cx.stream_info.sample_rate.get(),
        })
    }
}

struct TimelineProcessor {
    receiver: Output<Option<Plan>>,
    transport: Option<Transport>,
    generation: u64,
    fault: Arc<AtomicBool>,
    sample_rate: u32,
}

pub(crate) fn synchronize_transport(
    current: &mut Option<Transport>,
    generation: &mut u64,
    plan: &Plan,
) {
    let mut next = plan.transport.clone();
    if let Some(previous) = current {
        if *generation == plan.seek_generation {
            next.position_frame = if previous.clock == next.clock {
                previous.position_frame
            } else {
                bar_to_frame(
                    next.clock,
                    frame_to_bar(previous.clock, previous.position_frame),
                )
            };
        }
    }
    *generation = plan.seek_generation;
    *current = Some(next);
}

impl AudioNodeProcessor for TimelineProcessor {
    fn process(
        &mut self,
        info: &ProcInfo,
        buffers: ProcBuffers,
        _: &mut ProcExtra,
    ) -> ProcessStatus {
        let updated = self.receiver.update();
        let Some(plan) = self.receiver.output_buffer_mut() else {
            return ProcessStatus::ClearAllOutputs;
        };
        if updated {
            synchronize_transport(&mut self.transport, &mut self.generation, plan);
        }
        let Some(transport) = self.transport.as_mut() else {
            return ProcessStatus::ClearAllOutputs;
        };
        if self.fault.load(Ordering::Relaxed) {
            return ProcessStatus::ClearAllOutputs;
        }
        plan.snapshot.version.fetch_add(1, Ordering::AcqRel);
        plan.mixer
            .render(transport, info.frames as u32, |frame, sample| {
                buffers.outputs[0][frame] = sample[0];
                buffers.outputs[1][frame] = sample[1];
            });
        plan.snapshot
            .frame
            .store(transport.position_frame, Ordering::Relaxed);
        plan.snapshot.latency.store(
            info.process_to_playback_delay.map_or(u64::MAX, |d| {
                (d.as_secs_f64() * f64::from(self.sample_rate)).round() as u64
            }),
            Ordering::Relaxed,
        );
        for (index, meter) in plan.snapshot.meters.iter().enumerate() {
            for channel in 0..2 {
                meter.peak[channel].store(
                    plan.mixer.peaks[index][channel].to_bits(),
                    Ordering::Relaxed,
                );
                meter.rms[channel]
                    .store(plan.mixer.rms[index][channel].to_bits(), Ordering::Relaxed);
            }
        }
        plan.snapshot.version.fetch_add(1, Ordering::Release);
        ProcessStatus::OutputsModified
    }
    fn new_stream(&mut self, info: &StreamInfo, _: &mut ProcStreamCtx) {
        if info.sample_rate.get() != self.sample_rate {
            self.fault.store(true, Ordering::Release);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        protocol::BackendProject,
        transport::{LoopRegion, TransportClock},
    };
    use std::collections::BTreeMap;

    #[test]
    fn control_updates_preserve_position_until_a_new_seek_generation() {
        let project: BackendProject = serde_json::from_value(serde_json::json!({"bpm":240.0,"numerator":4,"denominator":4,"loop":{"enabled":false,"startBar":1.0,"endBar":2.0},"tracks":[],"sources":[]})).unwrap();
        let clock = TransportClock::new(1, 1.0).unwrap();
        let mut current = None;
        let mut generation = 0;
        let mut requested_generation = 0;
        let mut expected = Transport {
            clock,
            position_frame: 0,
            playing: false,
            loop_region: None,
        };
        let mut seed = 0x61bed_u64;
        let mut random = || {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            (seed >> 32) as u32
        };
        for index in 0..3000 {
            let seek = index == 0 || random() % 3 == 0;
            if seek {
                requested_generation += 1;
            }
            let target = u64::from(random() % 200);
            let playing = random() % 3 != 0;
            let loop_region = if random() % 2 == 0 {
                LoopRegion::new(5, 17)
            } else {
                None
            };
            let mut plan = Plan {
                mixer: Mixer::compile(&project, clock, &BTreeMap::new()).unwrap(),
                transport: Transport {
                    clock,
                    position_frame: target,
                    playing,
                    loop_region,
                },
                seek_generation: requested_generation,
                snapshot: Arc::new(Snapshot::new(0)),
            };
            if seek {
                expected.position_frame = target;
            }
            expected.playing = playing;
            expected.loop_region = loop_region;
            synchronize_transport(&mut current, &mut generation, &plan);
            let actual = current.as_mut().unwrap();
            assert_eq!(actual.position_frame, expected.position_frame);
            let frames = random() % 64;
            plan.mixer.render(actual, frames, |_, _| {});
            expected.advance(frames);
            assert_eq!(actual.position_frame, expected.position_frame);
        }
    }
}
