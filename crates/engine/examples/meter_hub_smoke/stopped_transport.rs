use super::{execute, MainQueue};
use serde_json::Value;
use std::time::{Duration, Instant};
use zoeydaw_engine::{
    realtime::{meter_hub::HubTransport, native_reader::NativeStoppedTransport},
    PlaybackService,
};

fn wait_stopped(
    service: &PlaybackService,
    lease: &str,
    session: &str,
    expected: NativeStoppedTransport,
) -> Result<NativeStoppedTransport, String> {
    let until = Instant::now() + Duration::from_secs(2);
    loop {
        if let Some(snapshot) = service.meter_snapshot(lease, session)? {
            if snapshot.registry.graph.sample_rate().is_some()
                || !snapshot.records.is_empty()
                || snapshot.sources.iter().any(|source| source.flags & zoeydaw_engine::realtime::protocol_generated::SOURCE_FLAGS_VALID as u32 != 0)
            {
                return Err("No-graph stopped state fabricated audio observations".into());
            }
            if let HubTransport::Stopped(position) = snapshot.transport {
                if position.applied_sequence == expected.applied_sequence
                    && position.control_generation == expected.control_generation
                    && (position.bar - expected.bar).abs() < 1e-8
                    && (position.bars_per_second - expected.bars_per_second).abs() < 1e-8
                {
                    return Ok(position);
                }
            }
        }
        if Instant::now() >= until {
            return Err("No-graph stopped position did not reach the Hub".into());
        }
        std::thread::sleep(Duration::from_millis(8));
    }
}

pub(super) fn verify_open(
    service: &PlaybackService,
    main: &MainQueue,
    lease: &str,
    session: &str,
    request: &Value,
) -> Result<
    (
        NativeStoppedTransport,
        zoeydaw_engine::realtime::metadata_generated::RealtimeStreamOpenResult,
    ),
    String,
> {
    let registry = execute(
        main,
        service.refresh_meter_hub(main, lease.into(), session.into()),
    )?;
    if registry.graph.sample_rate().is_some() {
        return Err("Stopped project invented a graph format".into());
    }
    let project = &request["state"]["project"];
    let quarters = project["numerator"].as_f64().ok_or("Missing numerator")? * 4.0
        / project["denominator"]
            .as_f64()
            .ok_or("Missing denominator")?;
    let position = wait_stopped(
        service,
        lease,
        session,
        NativeStoppedTransport {
            applied_sequence: request["sequence"].as_u64().ok_or("Missing sequence")?,
            control_generation: request["controlGeneration"]
                .as_str()
                .ok_or("Missing generation")?
                .parse::<u64>()
                .map_err(|e| e.to_string())?,
            bar: request["state"]["control"]["seekBar"]
                .as_f64()
                .ok_or("Missing seek bar")?,
            bars_per_second: project["bpm"].as_f64().ok_or("Missing BPM")? / (60.0 * quarters),
            ..Default::default()
        },
    )?;
    println!(
        "Stopped open -> same Hub: owner={} bar={}, no graph/sample clock fabricated",
        position.owner_epoch, position.bar
    );
    let stream = service.open_meter_stream("hub-smoke-main", lease, session)?;
    service.set_meter_interest(
        "hub-smoke-main",
        zoeydaw_engine::realtime::metadata_generated::MeterInterest {
            stream_id: stream.stream_id,
            revision: 1,
            endpoint_ids: Vec::new(),
            transport: true,
            rate_hz: zoeydaw_engine::realtime::metadata_generated::MeterRateHz::Value60,
            visible: true,
        },
    )?;
    super::transport_frames::capture(service, stream.stream_id, "stopped-open", |header| {
        header.transport_kind == 1
            && header.owner_epoch == position.owner_epoch
            && header.bar == position.bar
    })?;
    Ok((position, stream))
}

pub(super) fn verify_seek(
    service: &PlaybackService,
    main: &MainQueue,
    lease: &str,
    session: &str,
    initial: NativeStoppedTransport,
    stream: u32,
) -> Result<(), String> {
    let request = serde_json::json!({"protocolVersion":2,"sessionId":session,"sequence":5,"controlGeneration":"9007199254740994","control":{"playing":false,"recording":false,"seekBar":9,"seekGeneration":1}});
    if execute(main, service.control(main, request, lease.into(), 0))?["kind"] != "accepted" {
        return Err("No-graph stopped seek was rejected".into());
    }
    let position = wait_stopped(
        service,
        lease,
        session,
        NativeStoppedTransport {
            applied_sequence: 5,
            control_generation: 9007199254740994,
            bar: 9.0,
            bars_per_second: 122.0 / 240.0,
            ..Default::default()
        },
    )?;
    if position.owner_epoch <= initial.owner_epoch {
        return Err("Stopped replacement retained the retired Edit owner".into());
    }
    println!(
        "No-graph seek -> same Hub: owner={} generation={} sequence={} bar={}",
        position.owner_epoch, position.control_generation, position.applied_sequence, position.bar
    );
    super::transport_frames::capture(service, stream, "stopped-seek", |header| {
        header.transport_kind == 1
            && header.control_generation == 9007199254740994
            && header.applied_sequence == 5
            && header.bar == 9.0
            && header.sample_rate == 0.0
            && header.slot_count == 0
    })?;
    Ok(())
}

pub(super) fn verify_playing(
    service: &PlaybackService,
    lease: &str,
    session: &str,
    prepared: bool,
    stream: u32,
) -> Result<(), String> {
    let until = Instant::now() + Duration::from_secs(2);
    let mut last = None;
    loop {
        if let Some(snapshot) = service.meter_snapshot(lease, session)? {
            last = Some(snapshot.transport);
            match snapshot.transport {
                HubTransport::Unavailable if !prepared => {
                    super::transport_frames::capture(service, stream, "pending", |header| {
                        header.transport_kind == 0
                            && header.control_generation == 0
                            && header.sample_rate == 0.0
                    })?;
                    return Ok(());
                }
                HubTransport::Audio(value)
                    if prepared
                        && value.audio.control_valid == 1
                        && value.audio.control_generation == 9007199254740995
                        && value.audio.applied_sequence == 6
                        && value.audio.playing == 1
                        && value.audio.audible_valid == 1
                        && (value.audio.tempo_bpm - 122.0).abs() < 1e-8 =>
                {
                    println!(
                        "Stopped -> pending -> audio: same Hub adopted the actual resumed block"
                    );
                    super::transport_frames::capture(service, stream, "resumed", |header| {
                        header.transport_kind == 2
                            && header.transport_flags & 3 == 3
                            && header.control_generation == 9007199254740995
                            && header.applied_sequence == 6
                    })?;
                    return Ok(());
                }
                _ => {}
            }
        }
        if Instant::now() >= until {
            return Err(format!("Hub did not retire the stopped coordinate after Play; prepared={prepared}, last={last:?}"));
        }
        std::thread::sleep(Duration::from_millis(8));
    }
}
