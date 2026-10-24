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
    let hex = include_str!("../../../../protocol/fixtures/levels-v1.hex").trim();
    let bytes: Vec<u8> = hex
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
        .collect();
    let decoded = super::levels::decode_levels(&bytes).unwrap();
    assert_eq!(decoded.header.seq, 9007199254740993);
    assert_eq!(decoded.header.timeline_sample, -512);
    assert_eq!(decoded.records[0].slot_reset_epoch, 7);
    assert_eq!(decoded.records[0].clip_count, 9007199254740997);
    assert_eq!(decoded.sources[0].source_rate, 44100.0);
    assert!(super::levels::decode_levels(&bytes[..bytes.len() - 1]).is_none());
    let mut corrupt = bytes.clone();
    corrupt[144..148].copy_from_slice(&f32::NAN.to_le_bytes());
    assert!(super::levels::decode_levels(&corrupt).is_none());
    let mut corrupt = bytes;
    corrupt[84..88].copy_from_slice(&8u32.to_le_bytes());
    assert!(super::levels::decode_levels(&corrupt).is_none());
}
