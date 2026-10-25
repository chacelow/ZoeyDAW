use zoeydaw_engine::PlaybackService;

pub(super) fn verify(
    service: &PlaybackService,
    lease: &str,
    session: &str,
    request: &serde_json::Value,
) -> Result<(), String> {
    use zoeydaw_engine::realtime::{
        levels::{decode_levels, encode_levels},
        protocol_generated::*,
    };
    let snapshot = service
        .meter_snapshot(lease, session)?
        .ok_or("Missing binary smoke snapshot")?;
    let sample_rate = snapshot
        .registry
        .graph
        .sample_rate()
        .ok_or("Binary codec probe requires an audio graph")?;
    let observation = snapshot
        .transport
        .audio()
        .ok_or("Missing binary smoke transport")?;
    let metadata = snapshot.realtime_registry(1, 1)?;
    let slots: Vec<_> = metadata
        .entries
        .iter()
        .rev()
        .map(|entry| entry.slot_id)
        .collect();
    let records = snapshot.select_records(&slots)?;
    let header = WireHeader {
        magic: MAGIC as u32,
        version: VERSION as u16,
        header_bytes: HEADER_BYTES as u16,
        generation: metadata.generation,
        registry_revision: metadata.registry_revision,
        stream_id: 1,
        slot_count: 0,
        seq: snapshot.sequence,
        time_samples: observation.audio.device_sample,
        sample_rate: sample_rate.get(),
        produced_monotonic_ns: snapshot.produced_monotonic_ns,
        control_generation: if observation.audio.control_valid == 1 {
            observation.audio.control_generation
        } else {
            0
        },
        accepted_revision: 0,
        audio_revision: 0,
        subscription_revision: 1,
        flags: if observation.audio.playing == 1 {
            HEADER_FLAGS_PLAYING as u32
        } else {
            0
        },
        timeline_sample: observation.audio.timeline_sample,
        timeline_beat: observation.audio.timeline_beat,
        tempo_bpm: observation.audio.tempo_bpm,
        device_epoch: metadata.device_epoch,
        source_count: 0,
        reset_epoch: snapshot.reset_epoch,
        frame_type: FRAME_TYPES_LEVELS as u32,
        applied_sequence: if observation.audio.control_valid == 1 {
            observation.audio.applied_sequence
        } else {
            0
        },
        owner_epoch: if observation.audio.control_valid == 1 {
            observation.audio.owner_epoch
        } else {
            0
        },
        bar: observation.audio.bar,
        bars_per_second: observation.audio.bars_per_second,
        audible_bar: if observation.audio.audible_valid == 1 {
            observation.audio.audible_bar
        } else {
            0.0
        },
        audible_bars_per_second: if observation.audio.audible_valid == 1 {
            observation.audio.audible_bars_per_second
        } else {
            0.0
        },
        observed_monotonic_ns: observation.received_monotonic_ns,
        transport_kind: TRANSPORT_KINDS_AUDIO as u32,
        transport_flags: (if observation.audio.control_valid == 1 {
            TRANSPORT_FLAGS_CONTROL_VALID as u32
        } else {
            0
        }) | if observation.audio.audible_valid == 1 {
            TRANSPORT_FLAGS_AUDIBLE_VALID as u32
        } else {
            0
        },
    };
    let bytes = encode_levels(header, &records, &snapshot.sources)
        .ok_or("Live Hub record encoding failed")?;
    let frame = decode_levels(&bytes).ok_or("Live Hub bytes failed decoder")?;
    if frame.records != records
        || frame.sources != snapshot.sources
        || frame.header.timeline_sample != observation.audio.timeline_sample
        || bytes.len()
            != HEADER_BYTES + RECORD_BYTES * slots.len() + SOURCE_BYTES * snapshot.sources.len()
    {
        return Err("Live binary frame changed slot identity or audio coordinates".into());
    }
    println!("Live Hub binary codec: {} bytes, {} reversed-interest slots, audio coordinates preserved; revision fields are fixture values",bytes.len(),slots.len());
    for mapping in &metadata.sources {
        let authored = request["state"]["project"]["sources"]
            .as_array()
            .ok_or("Missing authored sources")?
            .iter()
            .find(|source| source["id"].as_str() == Some(mapping.source_id.as_str()))
            .ok_or("Source registry lost its authored identity")?;
        if authored["sampleRate"].as_f64() != Some(mapping.source_rate.get()) {
            return Err("Source registry changed the decoded sample rate".into());
        }
        let source = frame
            .sources
            .iter()
            .find(|source| source.clip_handle == mapping.clip_handle)
            .ok_or("Live source observation missing")?;
        if source.flags & SOURCE_FLAGS_VALID as u32 == 0
            || source.source_frame <= 0.0
            || source.source_frame >= authored["frames"].as_f64().ok_or("Missing source frames")?
            || source.position_age_samples != (sample_rate.get() * 0.05).ceil() as u32
        {
            return Err(
                "Source observation did not contain a recent actual reader position".into(),
            );
        }
        println!(
            "Actual source observation: clip={} source={} frame={} ageBound={} device samples",
            mapping.clip_id, mapping.source_id, source.source_frame, source.position_age_samples
        );
    }
    Ok(())
}
