use super::metadata_generated::{JsonU64, RealtimeEvent, RecordingState};

#[test]
fn json_u64_preserves_exact_decimal_and_rejects_invalid_values() {
    let value: JsonU64 = serde_json::from_str("\"9007199254740993\"").unwrap();
    assert_eq!(value.0, 9007199254740993);
    assert_eq!(
        serde_json::to_string(&value).unwrap(),
        "\"9007199254740993\""
    );
    for invalid in [
        "1",
        "\"01\"",
        "\"-1\"",
        "\"18446744073709551616\"",
        "\"1e3\"",
    ] {
        assert!(serde_json::from_str::<JsonU64>(invalid).is_err());
    }
}

#[test]
fn event_validation_rejects_unknown_variants_and_payload_fields() {
    let event = serde_json::json!({
        "sessionId": "session", "sessionEpoch": 1, "streamId": 2,
        "deviceEpoch": 3, "generation": 4, "registryRevision": 5,
        "seq": "9007199254740993", "kind": "xrun", "count": "1", "deviceSample": "512"
    });
    assert!(matches!(
        serde_json::from_value::<RealtimeEvent>(event.clone()).unwrap(),
        RealtimeEvent::Xrun { .. }
    ));
    let mut extra = event.clone();
    extra["extra"] = serde_json::json!(true);
    assert!(serde_json::from_value::<RealtimeEvent>(extra).is_err());
    let mut unknown = event;
    unknown["kind"] = serde_json::json!("future-event");
    assert!(serde_json::from_value::<RealtimeEvent>(unknown).is_err());
}

#[test]
fn committed_and_failed_recordings_require_terminal_payloads() {
    assert!(serde_json::from_str::<RecordingState>(r#"{"state":"committed"}"#).is_err());
    assert!(serde_json::from_str::<RecordingState>(r#"{"state":"failed"}"#).is_err());
}

#[test]
fn nullable_fields_are_required_on_the_wire() {
    let mut event = serde_json::json!({
        "sessionId": "session", "sessionEpoch": 1, "streamId": 2,
        "deviceEpoch": 3, "generation": 4, "registryRevision": 5,
        "seq": "1", "kind": "session-slot-state", "slotId": "slot", "trackId": "track", "status": "stopped"
    });
    assert!(serde_json::from_value::<RealtimeEvent>(event.clone()).is_err());
    event["queuedSample"] = serde_json::Value::Null;
    assert!(matches!(
        serde_json::from_value::<RealtimeEvent>(event).unwrap(),
        RealtimeEvent::SessionSlotState {
            queued_sample: None,
            ..
        }
    ));
}

#[test]
fn binary_golden_preserves_identity_and_rejects_corruption() {
    let hex = include_str!("../../../../protocol/fixtures/levels-v2.hex").trim();
    let bytes: Vec<u8> = hex
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
        .collect();
    let decoded = super::levels::decode_levels(&bytes).unwrap();
    assert_eq!(
        super::levels::encode_levels(decoded.header, &decoded.records, &decoded.sources).unwrap(),
        bytes
    );
    let mut invalid_records = decoded.records.clone();
    invalid_records.push(invalid_records[0]);
    assert!(
        super::levels::encode_levels(decoded.header, &invalid_records, &decoded.sources).is_none()
    );
    invalid_records.truncate(1);
    invalid_records[0].rms = f32::NAN;
    assert!(
        super::levels::encode_levels(decoded.header, &invalid_records, &decoded.sources).is_none()
    );
    assert_eq!(decoded.header.seq, 9007199254740993);
    assert_eq!(decoded.header.timeline_sample, -512);
    assert_eq!(decoded.records[0].slot_reset_epoch, 7);
    assert_eq!(decoded.records[0].clip_count, 9007199254740997);
    assert_eq!(decoded.sources[0].source_rate, 44100.0);
    assert!(super::levels::decode_levels(&bytes[..bytes.len() - 1]).is_none());
    let mut corrupt = bytes.clone();
    let offset = super::protocol_generated::HEADER_BYTES + 16;
    corrupt[offset..offset + 4].copy_from_slice(&f32::NAN.to_le_bytes());
    assert!(super::levels::decode_levels(&corrupt).is_none());
    let mut corrupt = bytes;
    corrupt[84..88].copy_from_slice(&16u32.to_le_bytes());
    assert!(super::levels::decode_levels(&corrupt).is_none());
}

#[test]
fn input_slots_keep_independent_reset_baselines_when_projected_with_graph() {
    use super::{
        meter_hub::{HubInputSnapshot, HubSnapshot},
        native_reader::{NativeInputRegistry, NativeMeterRegistry},
    };
    use std::sync::Arc;
    let entry = |slot, id: &str, kind| super::metadata_generated::MeterRegistryEntry {
        slot_id: slot,
        endpoint_id: id.into(),
        owner_id: id.into(),
        kind,
        channel_index: 0,
        channel_count: 1,
        capabilities: Vec::new(),
    };
    let record = |slot, epoch| super::protocol_generated::WireRecord {
        slot_id: slot,
        flags: 1,
        block_end_sample: 512,
        peak: 0.25,
        rms: 0.25,
        hold: 0.25,
        session_peak: 0.25,
        clip_count: 0,
        valid_frames: 14400,
        slot_reset_epoch: epoch,
    };
    let input = NativeInputRegistry {
        device_epoch: 7,
        sample_rate: super::metadata_generated::PositiveF64::new(48000.0).unwrap(),
        entries: vec![entry(
            0,
            "input/device/0",
            super::metadata_generated::MeterEndpointKind::Input,
        )],
    };
    let snapshot = HubSnapshot {
        sequence: 9,
        produced_monotonic_ns: 1000,
        registry: Arc::new(NativeMeterRegistry {
            session_id: "session".into(),
            device_epoch: 6,
            generation: 4,
            registry_revision: 4,
            graph: super::native_reader::NativeMeterGraph::Prepared {
                sample_rate: input.sample_rate,
            },
            entries: vec![entry(
                0,
                "track/voice/out",
                super::metadata_generated::MeterEndpointKind::TrackOut,
            )],
            sources: Vec::new(),
            input: None,
        }),
        records: vec![record(0, 2)],
        sources: Vec::new(),
        reset_epoch: 5,
        endpoint_resets: Arc::new(Vec::new()),
        transport: super::meter_hub::HubTransport::Unavailable,
        input: Some(Arc::new(HubInputSnapshot {
            registry: Arc::new(input),
            records: vec![record(0, 5)],
        })),
    };
    let registry = snapshot.realtime_registry(3, 8).unwrap();
    assert_eq!(
        registry
            .entries
            .iter()
            .map(|entry| entry.slot_id)
            .collect::<Vec<_>>(),
        vec![0, 1]
    );
    assert_eq!(registry.device_epoch, 7);
    assert_eq!(registry.endpoint_resets[0].slot_ids, vec![0]);
    assert_eq!(registry.endpoint_resets[0].slot_reset_epoch, 2);
    assert_eq!(registry.endpoint_resets[1].slot_ids, vec![1]);
    assert_eq!(registry.endpoint_resets[1].slot_reset_epoch, 5);
    assert_eq!(snapshot.records[0].slot_id, 0);
    assert_eq!(snapshot.input.as_ref().unwrap().records[0].slot_id, 0);
    let selected = snapshot.select_records(&[1, 0]).unwrap();
    assert_eq!(
        selected
            .iter()
            .map(|record| (record.slot_id, record.slot_reset_epoch))
            .collect::<Vec<_>>(),
        vec![(1, 5), (0, 2)]
    );
    assert!(snapshot.select_records(&[1, 1]).is_err());
    assert!(snapshot.select_records(&[2]).is_err());
    let mut streams = super::streams::MeterStreams::default();
    let admission = streams.reserve("main", "lease-a", "session").unwrap();
    let first = streams.finish(admission, &snapshot).unwrap();
    let admission = streams.reserve("mixer", "lease-b", "session").unwrap();
    let second = streams.finish(admission, &snapshot).unwrap();
    assert!(streams.identity("mixer", first.stream_id).is_err());
    assert!(streams.reserve("main", "lease-a", "session").is_err());
    let interest =
        |id, revision, endpoint: &str, visible| super::metadata_generated::MeterInterest {
            stream_id: id,
            revision,
            endpoint_ids: vec![endpoint.into()],
            transport: false,
            rate_hz: super::metadata_generated::MeterRateHz::Value60,
            visible,
        };
    let input_interest = interest(first.stream_id, 1, "input/device/0", true);
    streams
        .set_interest("main", input_interest.clone())
        .unwrap();
    streams.set_interest("main", input_interest).unwrap();
    assert!(streams
        .set_interest(
            "main",
            interest(first.stream_id, 1, "track/voice/out", true)
        )
        .is_err());
    streams
        .set_interest(
            "mixer",
            interest(second.stream_id, 1, "track/voice/out", true),
        )
        .unwrap();
    assert_eq!(streams.slots("main", first.stream_id).unwrap(), vec![1]);
    let permit = streams.begin_read("main", first.stream_id).unwrap();
    assert!(streams.begin_read("main", first.stream_id).is_err());
    assert!(streams.read_is_current("main", &permit));
    assert!(permit.subscription_changed);
    assert!(streams.complete_read("main", &permit));
    streams
        .set_interest(
            "main",
            interest(first.stream_id, 2, "input/device/0", false),
        )
        .unwrap();
    assert!(!streams.read_is_current("main", &permit));
    drop(permit);
    let permit = streams.begin_read("main", first.stream_id).unwrap();
    assert!(permit.subscription_changed);
    drop(permit);
    assert!(streams
        .begin_read("main", first.stream_id)
        .unwrap()
        .slots
        .is_empty());
    streams
        .set_interest("main", interest(first.stream_id, 3, "input/device/0", true))
        .unwrap();
    let permit = streams.begin_read("main", first.stream_id).unwrap();
    assert!(permit.subscription_changed);
    assert!(streams.complete_read("main", &permit));
    drop(permit);
    assert!(
        !streams
            .begin_read("main", first.stream_id)
            .unwrap()
            .subscription_changed
    );
    assert_eq!(
        streams.visible_interest("session"),
        vec!["input/device/0", "track/voice/out"]
    );
    let mut replacement_registry = snapshot.registry.as_ref().clone();
    replacement_registry.generation += 1;
    replacement_registry.entries.push(entry(
        1,
        "track/new/out",
        super::metadata_generated::MeterEndpointKind::TrackOut,
    ));
    let replacement = HubSnapshot {
        registry: Arc::new(replacement_registry),
        records: vec![record(0, 2), record(1, 0)],
        ..snapshot
    };
    let old_permit = streams.begin_read("main", first.stream_id).unwrap();
    let updated = streams
        .registry("main", first.stream_id, &replacement)
        .unwrap();
    assert!(!streams.read_is_current("main", &old_permit));
    drop(old_permit);
    assert_eq!(
        updated.registry_revision,
        first.registry.registry_revision + 1
    );
    assert_eq!(streams.slots("main", first.stream_id).unwrap(), vec![2]);
    assert_eq!(
        streams
            .registry("main", first.stream_id, &replacement)
            .unwrap(),
        updated
    );
    let closed_permit = streams.begin_read("main", first.stream_id).unwrap();
    streams.close_window("main");
    assert!(streams.identity("main", first.stream_id).is_err());
    assert!(!streams.read_is_current("main", &closed_permit));
    drop(closed_permit);
    assert_eq!(streams.visible_interest("session"), vec!["track/voice/out"]);
    streams.close_lease("lease-b");
    assert!(streams.visible_interest("session").is_empty());
    let admission = streams.reserve("closing", "lease-c", "session").unwrap();
    streams.close_window("closing");
    assert!(streams.finish(admission, &replacement).is_err());
    let admission = streams.reserve("released", "lease-d", "session").unwrap();
    streams.close_lease("lease-d");
    assert!(streams.finish(admission, &replacement).is_err());
    let admission = streams.reserve("closing", "lease-e", "session").unwrap();
    let retained = streams.finish(admission, &replacement).unwrap();
    let stale_admission = streams.reserve("late", "lease-f", "session").unwrap();
    let mut next_registry = replacement.registry.as_ref().clone();
    next_registry.session_id = "next-session".into();
    let next = HubSnapshot {
        registry: Arc::new(next_registry),
        ..replacement
    };
    let admission = streams
        .reserve("closing", "lease-g", "next-session")
        .unwrap();
    let reopened = streams.finish(admission, &next).unwrap();
    assert!(reopened.stream_id > retained.stream_id);
    assert!(reopened.registry.session_epoch > retained.registry.session_epoch);
    assert!(streams.identity("closing", retained.stream_id).is_err());
    assert!(streams.finish(stale_admission, &next).is_err());
}

#[test]
fn source_registry_shares_source_identity_without_aliasing_clips_or_contents() {
    use super::{
        metadata_generated::{PositiveF64, SourceOwner, SourceRegistryEntry},
        native_reader::NativeMeterRegistry,
    };
    let source = SourceRegistryEntry {
        clip_handle: 1,
        clip_id: "first".into(),
        source_handle: 7,
        source_id: "audio".into(),
        source_generation: 2,
        source_rate: PositiveF64::new(48000.0).unwrap(),
        owner: SourceOwner::Arrangement,
    };
    let mut second = source.clone();
    second.clip_handle = 2;
    second.clip_id = "second".into();
    let registry = NativeMeterRegistry {
        session_id: "session".into(),
        device_epoch: 1,
        generation: 1,
        registry_revision: 1,
        graph: super::native_reader::NativeMeterGraph::Prepared {
            sample_rate: source.source_rate,
        },
        entries: Vec::new(),
        sources: vec![source, second],
        input: None,
    };
    assert!(registry.validate("session").is_ok());
    for variant in 0..4 {
        let mut invalid = registry.clone();
        match variant {
            0 => invalid.sources[1].clip_handle = invalid.sources[0].clip_handle,
            1 => invalid.sources[1].source_id = "other-content".into(),
            2 => invalid.sources[1].source_generation += 1,
            3 => invalid.sources[1].source_handle += 1,
            _ => unreachable!(),
        }
        assert!(invalid.validate("session").is_err());
    }
}
