use super::{
    meter_hub::{HubSnapshot, HubTransport},
    protocol_generated::*,
    streams::MeterReadPermit,
};

pub(super) fn header(
    snapshot: &HubSnapshot,
    permit: &MeterReadPermit,
    stream_id: u32,
) -> Result<WireHeader, String> {
    let mut header = WireHeader {
        magic: MAGIC as u32,
        version: VERSION as u16,
        header_bytes: HEADER_BYTES as u16,
        generation: permit.generation,
        registry_revision: permit.registry_revision,
        stream_id,
        slot_count: 0,
        seq: snapshot.sequence,
        time_samples: 0,
        sample_rate: 0.0,
        produced_monotonic_ns: snapshot.produced_monotonic_ns,
        control_generation: 0,
        accepted_revision: 0,
        audio_revision: 0,
        subscription_revision: permit.subscription_revision,
        flags: HEADER_FLAGS_REVISIONS_UNAVAILABLE as u32
            | if permit.subscription_changed {
                HEADER_FLAGS_SUBSCRIPTION_CHANGED as u32
            } else {
                0
            },
        timeline_sample: 0,
        timeline_beat: 0.0,
        tempo_bpm: 0.0,
        device_epoch: permit.device_epoch,
        source_count: 0,
        reset_epoch: snapshot.reset_epoch,
        frame_type: FRAME_TYPES_LEVELS as u32,
        applied_sequence: 0,
        owner_epoch: 0,
        bar: 0.0,
        bars_per_second: 0.0,
        audible_bar: 0.0,
        audible_bars_per_second: 0.0,
        observed_monotonic_ns: 0,
        transport_kind: TRANSPORT_KINDS_UNAVAILABLE as u32,
        transport_flags: 0,
    };
    match snapshot.transport {
        HubTransport::Unavailable => {}
        HubTransport::Stopped(value) => {
            header.transport_kind = TRANSPORT_KINDS_STOPPED as u32;
            header.transport_flags = TRANSPORT_FLAGS_CONTROL_VALID as u32;
            header.control_generation = value.control_generation;
            header.applied_sequence = value.applied_sequence;
            header.owner_epoch = value.owner_epoch;
            header.bar = value.bar;
            header.bars_per_second = value.bars_per_second;
            header.observed_monotonic_ns = snapshot.produced_monotonic_ns;
        }
        HubTransport::Audio(value) => {
            let audio = value.audio;
            header.transport_kind = TRANSPORT_KINDS_AUDIO as u32;
            header.time_samples = audio.device_sample;
            header.sample_rate = snapshot
                .registry
                .graph
                .sample_rate()
                .ok_or("Audio observation has no graph format")?
                .get();
            header.timeline_sample = audio.timeline_sample;
            header.timeline_beat = audio.timeline_beat;
            header.tempo_bpm = audio.tempo_bpm;
            header.bar = audio.bar;
            header.bars_per_second = audio.bars_per_second;
            header.observed_monotonic_ns = value.received_monotonic_ns;
            if audio.playing == 1 {
                header.flags |= HEADER_FLAGS_PLAYING as u32;
            }
            if audio.recording == 1 {
                header.flags |= HEADER_FLAGS_RECORDING as u32;
            }
            if audio.control_valid == 1 {
                header.transport_flags |= TRANSPORT_FLAGS_CONTROL_VALID as u32;
                header.control_generation = audio.control_generation;
                header.applied_sequence = audio.applied_sequence;
                header.owner_epoch = audio.owner_epoch;
            }
            if audio.audible_valid == 1 {
                header.transport_flags |= TRANSPORT_FLAGS_AUDIBLE_VALID as u32;
                header.audible_bar = audio.audible_bar;
                header.audible_bars_per_second = audio.audible_bars_per_second;
            }
        }
    }
    Ok(header)
}
