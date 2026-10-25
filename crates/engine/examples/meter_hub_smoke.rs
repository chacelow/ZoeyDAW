use serde_json::Value;
use std::{
    collections::VecDeque,
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
    task::{Context, Poll, Wake, Waker},
    time::{Duration, Instant},
};
use zoeydaw_engine::{MainThreadDispatcher, PlaybackService};

#[path = "meter_hub_smoke/binary_codec.rs"]
mod binary_codec;
#[path = "meter_hub_smoke/source_observations.rs"]
mod source_observations;
#[path = "meter_hub_smoke/stopped_transport.rs"]
mod stopped_transport;
#[path = "meter_hub_smoke/transport_frames.rs"]
mod transport_frames;

#[derive(Default)]
struct MainQueue(Mutex<VecDeque<Box<dyn FnOnce() + Send>>>);
impl MainThreadDispatcher for MainQueue {
    fn dispatch(&self, action: impl FnOnce() + Send + 'static) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|_| "Smoke queue poisoned")?
            .push_back(Box::new(action));
        Ok(())
    }
}
struct NoopWake;
impl Wake for NoopWake {
    fn wake(self: Arc<Self>) {}
}
fn execute<F: Future>(queue: &MainQueue, future: F) -> F::Output {
    let mut future = Box::pin(future);
    let waker = Waker::from(Arc::new(NoopWake));
    let mut context = Context::from_waker(&waker);
    loop {
        if let Poll::Ready(value) = Pin::as_mut(&mut future).poll(&mut context) {
            return value;
        }
        let action = queue.0.lock().unwrap().pop_front();
        if let Some(action) = action {
            action();
        } else {
            std::thread::yield_now();
        }
    }
}
fn main() -> Result<(), String> {
    let file = std::env::args()
        .nth(1)
        .ok_or("Usage: meter_hub_smoke REQUEST.json (real low-gain output)")?;
    let mut request: Value =
        serde_json::from_slice(&std::fs::read(file).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    request["state"]["control"]["playing"] = false.into();
    request["state"]["control"]["recording"] = false.into();
    for track in request["state"]["project"]["tracks"]
        .as_array_mut()
        .ok_or("Missing tracks")?
    {
        if track["kind"] == "main" {
            track["volumeDb"] = (-30).into();
        }
    }
    let session = request["sessionId"]
        .as_str()
        .ok_or("Missing session")?
        .to_owned();
    let lease = "meter-hub-smoke".to_owned();
    let service = PlaybackService::default();
    let main = MainQueue::default();
    service.acquire(lease.clone(), session.clone())?;
    let result = (|| {
        let accepted = execute(
            &main,
            service.apply(&main, request.clone(), lease.clone(), 0),
        )?;
        if accepted["kind"] != "accepted" {
            return Err("Native smoke project was rejected".into());
        }
        let stopped = execute(&main, service.telemetry(&main, lease.clone()))?;
        if stopped["meterReady"] != false {
            return Err("Stopped project fabricated a ready playback graph".into());
        }
        let (initial_stopped, mut stream) =
            stopped_transport::verify_open(&service, &main, &lease, &session, &request)?;
        let control = serde_json::json!({
            "protocolVersion": 2, "sessionId": session, "sequence": 1,
            "controlGeneration": "1", "control": {
                "playing": true, "recording": false, "seekBar": 1, "seekGeneration": 0
            }
        });
        if execute(&main, service.control(&main, control, lease.clone(), 0))?["kind"] != "accepted"
        {
            return Err("First Play was rejected".into());
        }
        if execute(&main, service.telemetry(&main, lease.clone()))?["meterReady"] != true {
            return Err("First Play did not expose a prepared meter graph".into());
        }
        println!("Stopped open -> first Play: explicit native meter readiness");
        let registry = execute(
            &main,
            service.refresh_meter_hub(&main, lease.clone(), session.clone()),
        )?;
        let sample_rate = registry
            .graph
            .sample_rate()
            .ok_or("Playing graph has no sample rate")?;
        stream.registry = execute(
            &main,
            service.refresh_meter_stream_registry(&main, "hub-smoke-main", stream.stream_id),
        )?;
        let repeated = execute(
            &main,
            service.refresh_meter_hub(&main, lease.clone(), session.clone()),
        )?;
        if repeated.identity() != registry.identity() {
            return Err("Same-graph refresh replaced meter identity".into());
        }
        service.meter_visible(&lease, &session, true)?;
        let deadline = Instant::now() + Duration::from_secs(3);
        let mut previous = 0;
        let mut snapshots = 0;
        let mut valid_rms = false;
        let mut peak = 0.0_f32;
        let mut first_transport = None;
        let mut latest_transport = None;
        while Instant::now() < deadline {
            if let Some(snapshot) = service.meter_snapshot(&lease, &session)? {
                if snapshot.sequence != previous {
                    previous = snapshot.sequence;
                    snapshots += 1;
                    if let Some(transport) = snapshot.transport.audio() {
                        first_transport.get_or_insert(transport);
                        latest_transport = Some(transport);
                    }
                    for record in &snapshot.records {
                        peak = peak.max(record.peak);
                        valid_rms |= record.valid_frames >= (sample_rate.get() * 0.3) as u32
                            && record.rms > 0.0;
                    }
                }
            }
            if valid_rms && snapshots > 10 {
                break;
            }
            std::thread::sleep(Duration::from_millis(8));
        }
        if !valid_rms || peak <= 0.0 {
            return Err("Hub did not aggregate live native audio".into());
        }
        if service.meter_snapshot("foreign", &session).is_ok() {
            return Err("Foreign lease read Hub".into());
        }
        println!("Live EngineSession -> native reader -> Rust Hub: slots={} snapshots={} peak={} validRms=true", registry.entries.len(), snapshots, peak);
        let other = service.open_meter_stream("hub-smoke-mixer", &lease, &session)?;
        let main_events = Arc::new(Mutex::new(Vec::<
            Vec<zoeydaw_engine::realtime::metadata_generated::RealtimeEvent>,
        >::new()));
        let mixer_events = Arc::new(Mutex::new(Vec::<
            Vec<zoeydaw_engine::realtime::metadata_generated::RealtimeEvent>,
        >::new()));
        for (window, id, target) in [
            ("hub-smoke-main", stream.stream_id, main_events.clone()),
            ("hub-smoke-mixer", other.stream_id, mixer_events.clone()),
        ] {
            service.bind_meter_events(
                window,
                id,
                Arc::new(move |batch| {
                    target
                        .lock()
                        .map_err(|_| "Event capture poisoned")?
                        .push(batch);
                    Ok(())
                }),
            )?;
        }
        if service
            .meter_stream_registry("foreign", stream.stream_id)
            .is_ok()
        {
            return Err("Foreign window read meter stream registry".into());
        }
        if service
            .meter_stream_clock_probe("foreign", stream.stream_id)
            .is_ok()
        {
            return Err("Foreign window read the Hub clock".into());
        }
        let clock_probe = service
            .meter_stream_clock_probe("hub-smoke-main", stream.stream_id)?
            .ok_or("Clock not ready")?;
        let latest = service
            .meter_snapshot(&lease, &session)?
            .ok_or("Clock snapshot missing")?;
        if clock_probe.monotonic_ns.0 < latest.produced_monotonic_ns.saturating_sub(100_000_000)
            || clock_probe.device_epoch != registry.device_epoch
            || clock_probe.sample_rate != sample_rate
        {
            return Err("Clock probe did not use the live Hub origin and device".into());
        }
        println!(
            "Owned clock probe: epoch={}, sample={}, ns={}",
            clock_probe.device_epoch, clock_probe.time_samples.0, clock_probe.monotonic_ns.0
        );
        let endpoint = registry
            .entries
            .first()
            .ok_or("Missing interest endpoint")?
            .endpoint_id
            .clone();
        for (window, id) in [
            ("hub-smoke-main", stream.stream_id),
            ("hub-smoke-mixer", other.stream_id),
        ] {
            service.set_meter_interest(
                window,
                zoeydaw_engine::realtime::metadata_generated::MeterInterest {
                    stream_id: id,
                    revision: if id == stream.stream_id { 2 } else { 1 },
                    endpoint_ids: vec![endpoint.clone()],
                    transport: true,
                    rate_hz: zoeydaw_engine::realtime::metadata_generated::MeterRateHz::Value60,
                    visible: true,
                },
            )?;
        }
        {
            use zoeydaw_engine::realtime::{
                levels::decode_levels, protocol_generated::HEADER_FLAGS_REVISIONS_UNAVAILABLE,
            };
            let bytes = service.meter_stream_snapshot("hub-smoke-main", stream.stream_id, 0)?;
            let frame =
                decode_levels(&bytes).ok_or("Stream did not return a valid binary frame")?;
            let expected: Vec<_> = stream
                .registry
                .entries
                .iter()
                .filter(|entry| entry.endpoint_id == endpoint)
                .map(|entry| entry.slot_id)
                .collect();
            if frame.header.stream_id != stream.stream_id
                || frame
                    .records
                    .iter()
                    .map(|record| record.slot_id)
                    .collect::<Vec<_>>()
                    != expected
                || frame.header.flags & HEADER_FLAGS_REVISIONS_UNAVAILABLE as u32 == 0
                || frame.sources.len() != stream.registry.sources.len()
                || frame
                    .sources
                    .iter()
                    .zip(&stream.registry.sources)
                    .any(|(source, mapping)| {
                        source.clip_handle != mapping.clip_handle
                            || source.source_handle != mapping.source_handle
                            || source.source_generation != mapping.source_generation
                            || source.source_rate != mapping.source_rate.get()
                    })
            {
                return Err("Stream frame lost interest identity or revision availability".into());
            }
            if !service
                .meter_stream_snapshot("hub-smoke-main", stream.stream_id, u64::MAX)?
                .is_empty()
                || service
                    .meter_stream_snapshot("foreign", stream.stream_id, 0)
                    .is_ok()
            {
                return Err("Stream empty response or window isolation failed".into());
            }
            service.set_meter_interest(
                "hub-smoke-main",
                zoeydaw_engine::realtime::metadata_generated::MeterInterest {
                    stream_id: stream.stream_id,
                    revision: 3,
                    endpoint_ids: vec![endpoint.clone()],
                    transport: true,
                    rate_hz: zoeydaw_engine::realtime::metadata_generated::MeterRateHz::Value60,
                    visible: false,
                },
            )?;
            if !service
                .meter_stream_snapshot("hub-smoke-main", stream.stream_id, 0)?
                .is_empty()
            {
                return Err("Hidden stream returned meter data".into());
            }
            service.set_meter_interest(
                "hub-smoke-main",
                zoeydaw_engine::realtime::metadata_generated::MeterInterest {
                    stream_id: stream.stream_id,
                    revision: 4,
                    endpoint_ids: vec![endpoint.clone()],
                    transport: true,
                    rate_hz: zoeydaw_engine::realtime::metadata_generated::MeterRateHz::Value60,
                    visible: true,
                },
            )?;
            let refreshed =
                service.meter_stream_snapshot("hub-smoke-main", stream.stream_id, u64::MAX)?;
            let refreshed = decode_levels(&refreshed)
                .ok_or("Changed interest did not force a complete snapshot")?;
            if refreshed.header.subscription_revision != 4
                || !service
                    .meter_stream_snapshot("hub-smoke-main", stream.stream_id, u64::MAX)?
                    .is_empty()
            {
                return Err("Interest change was not delivered exactly once".into());
            }
            println!("Stream binary snapshot: {} bytes, {} interested slots, hidden/unchanged empty, foreign window rejected",bytes.len(),expected.len());
        }
        transport_frames::capture(&service, stream.stream_id, "playing", |header| {
            header.transport_kind == 2
                && header.transport_flags & 1 != 0
                && header.applied_sequence == 1
        })?;
        service.meter_stream_registry("hub-smoke-main", stream.stream_id)?;
        let first = first_transport.ok_or("Audio graph did not publish transport")?;
        let latest = latest_transport.ok_or("Transport observation missing")?;
        let expected_bpm = request["state"]["project"]["bpm"]
            .as_f64()
            .ok_or("Missing BPM")?;
        let reference_delta = latest
            .audio
            .reference_sample
            .checked_sub(first.audio.reference_sample)
            .ok_or("Transport reference sample regressed")?;
        let sample_delta = latest.audio.timeline_sample - first.audio.timeline_sample;
        let expected_beats = sample_delta as f64 / sample_rate.get() * expected_bpm / 60.0;
        if reference_delta == 0
            || latest.audio.device_sample <= first.audio.device_sample
            || sample_delta <= 0
            || latest.audio.playing != 1
            || latest.received_monotonic_ns <= first.received_monotonic_ns
            || (latest.audio.tempo_bpm - expected_bpm).abs() > 1e-6
            || (latest.audio.timeline_beat - first.audio.timeline_beat - expected_beats).abs()
                > 1e-6
        {
            return Err("Audio transport sample/beat clock did not advance coherently".into());
        }
        let quarters_per_bar = request["state"]["project"]["numerator"]
            .as_f64()
            .ok_or("Missing numerator")?
            * 4.0
            / request["state"]["project"]["denominator"]
                .as_f64()
                .ok_or("Missing denominator")?;
        if latest.audio.control_valid != 1
            || latest.audio.control_generation != 1
            || latest.audio.applied_sequence != 1
            || latest.audio.owner_epoch == 0
            || latest.audio.recording != 0
            || (latest.audio.bar - (1.0 + latest.audio.timeline_beat / quarters_per_bar)).abs()
                > 1e-8
            || (latest.audio.bars_per_second - expected_bpm / (60.0 * quarters_per_bar)).abs()
                > 1e-8
            || latest.audio.audible_valid != 1
            || !latest.audio.audible_bar.is_finite()
            || (latest.audio.audible_bars_per_second - expected_bpm / (60.0 * quarters_per_bar))
                .abs()
                > 1e-8
        {
            return Err(
                "Rust Hub lost the audio block's control identity or rendered clock coordinates"
                    .into(),
            );
        }
        println!("Audio-side control witness: generation={} appliedSequence={} ownerEpoch={} renderedBar={}",
                 latest.audio.control_generation,latest.audio.applied_sequence,latest.audio.owner_epoch,latest.audio.bar);
        println!(
            "Same-block engine audible position: bar={} barsPerSecond={}",
            latest.audio.audible_bar, latest.audio.audible_bars_per_second
        );
        println!(
            "Audio transport: reference {} -> {}, device {} -> {}, timeline {} -> {}, BPM {}",
            first.audio.reference_sample,
            latest.audio.reference_sample,
            first.audio.device_sample,
            latest.audio.device_sample,
            first.audio.timeline_sample,
            latest.audio.timeline_sample,
            latest.audio.tempo_bpm
        );
        binary_codec::verify(&service, &lease, &session, &request)?;
        for (window, id, batches) in [
            ("hub-smoke-main", stream.stream_id, &main_events),
            ("hub-smoke-mixer", other.stream_id, &mixer_events),
        ] {
            let mut acknowledged = 0;
            loop {
                let Some(batch) = batches.lock().unwrap().get(acknowledged).cloned() else {
                    break;
                };
                let through = batch
                    .iter()
                    .map(|event| {
                        serde_json::to_value(event).unwrap()["seq"]
                            .as_str()
                            .unwrap()
                            .parse::<u64>()
                            .unwrap()
                    })
                    .max()
                    .ok_or("Empty initial registry batch")?;
                service.meter_event_receipt(window, id, through)?;
                acknowledged += 1;
            }
            batches.lock().unwrap().clear();
        }
        let reset_endpoint = registry
            .entries
            .first()
            .ok_or("No meter endpoints")?
            .endpoint_id
            .clone();
        let mut reset = Box::pin(service.reset_meter_stream(
            "hub-smoke-main",
            stream.stream_id,
            vec![reset_endpoint.clone()],
            zoeydaw_engine::realtime::metadata_generated::MeterResetKind::Hold,
        ));
        let waker = Waker::from(Arc::new(NoopWake));
        let mut context = Context::from_waker(&waker);
        let deadline = Instant::now() + Duration::from_secs(2);
        let baseline = loop {
            if let Poll::Ready(result) = reset.as_mut().poll(&mut context) {
                break result?;
            }
            if Instant::now() > deadline {
                return Err("Audio did not confirm meter reset".into());
            }
            std::thread::sleep(Duration::from_millis(2));
        };
        let confirmed = service
            .meter_snapshot(&lease, &session)?
            .ok_or("Reset snapshot missing")?;
        for (entry, record) in confirmed.registry.entries.iter().zip(&confirmed.records) {
            if entry.endpoint_id == reset_endpoint {
                if record.slot_reset_epoch != baseline.reset_epoch {
                    return Err("Reset returned before affected slots adopted epoch".into());
                }
            } else if record.slot_reset_epoch != 0 {
                return Err("Selective reset cleared unrelated endpoint".into());
            }
        }
        println!(
            "Selective reset confirmed at audio epoch {}, unrelated endpoints unchanged",
            baseline.reset_epoch
        );
        let first_batch = main_events
            .lock()
            .unwrap()
            .last()
            .cloned()
            .ok_or("Main reset events missing")?;
        let mixer_batch = mixer_events
            .lock()
            .unwrap()
            .last()
            .cloned()
            .ok_or("Mixer reset events missing")?;
        let through = first_batch
            .iter()
            .map(|event| {
                serde_json::to_value(event).unwrap()["seq"]
                    .as_str()
                    .unwrap()
                    .parse::<u64>()
                    .unwrap()
            })
            .max()
            .ok_or("Empty reset batch")?;
        for batch in [&first_batch, &mixer_batch] {
            if !batch.iter().any(|event| matches!(event,
                zoeydaw_engine::realtime::metadata_generated::RealtimeEvent::MeterReset { baseline: value, .. }
                if value == &baseline)) {
                return Err("Confirmed reset was not broadcast to both streams".into());
            }
        }
        service.meter_event_receipt("hub-smoke-main", stream.stream_id, through)?;
        let second = execute(
            &main,
            service.reset_meter_stream(
                "hub-smoke-main",
                stream.stream_id,
                vec![reset_endpoint],
                zoeydaw_engine::realtime::metadata_generated::MeterResetKind::Hold,
            ),
        )?;
        if main_events.lock().unwrap().len() != 2 || mixer_events.lock().unwrap().len() != 1 {
            return Err(
                "Slow event receipt blocked sibling or accumulated in-flight batches".into(),
            );
        }
        let mixer_through = mixer_batch
            .iter()
            .map(|event| {
                serde_json::to_value(event).unwrap()["seq"]
                    .as_str()
                    .unwrap()
                    .parse::<u64>()
                    .unwrap()
            })
            .max()
            .unwrap();
        service.meter_event_receipt("hub-smoke-mixer", other.stream_id, mixer_through)?;
        if !mixer_events.lock().unwrap().last().unwrap().iter().any(|event| matches!(event,
            zoeydaw_engine::realtime::metadata_generated::RealtimeEvent::MeterReset { baseline: value, .. }
            if value == &second)) {
            return Err("Receipt did not release the next confirmed reset batch".into());
        }
        service.close_meter_window("hub-smoke-mixer")?;
        println!("Reliable reset events: two streams, independent receipts, one batch in flight, audio-confirmed baselines");
        let before_pause = service
            .meter_snapshot(&lease, &session)?
            .ok_or("Missing pre-pause snapshot")?;
        std::thread::sleep(Duration::from_millis(1200));
        let after_pause = service
            .meter_snapshot(&lease, &session)?
            .ok_or("Missing resumed snapshot")?;
        if after_pause.sequence <= before_pause.sequence + 10
            || after_pause.produced_monotonic_ns <= before_pause.produced_monotonic_ns
        {
            return Err("Slow consumer blocked native Hub progress".into());
        }
        if !after_pause
            .records
            .iter()
            .any(|record| record.session_peak >= peak)
        {
            return Err("Slow consumer lost latched peak".into());
        }
        println!(
            "No-consumer 1.2s pause: Hub sequence {} -> {}, peak retained",
            before_pause.sequence, after_pause.sequence
        );
        source_observations::verify(
            &service,
            &main,
            &request,
            &lease,
            &session,
            stream.stream_id,
        )?;
        request["state"]["project"]["bpm"] = 121.into();
        request["state"]["project"]["numerator"] = 3.into();
        request["stage"] = "commit".into();
        request["sequence"] = 2.into();
        request["revision"] = 1.into();
        let accepted = execute(
            &main,
            service.apply(&main, request.clone(), lease.clone(), 0),
        )?;
        if accepted["kind"] != "accepted" {
            return Err("Graph replacement was rejected".into());
        }
        let replacement = execute(
            &main,
            service.refresh_meter_stream_registry(&main, "hub-smoke-main", stream.stream_id),
        )?;
        if replacement.generation <= registry.generation {
            return Err("Owned stream refresh did not install the replacement graph".into());
        }
        let until = Instant::now() + Duration::from_secs(2);
        let mut adopted = false;
        while Instant::now() < until {
            if let Some(snapshot) = service.meter_snapshot(&lease, &session)? {
                if snapshot.reset_epoch < baseline.reset_epoch {
                    return Err("Graph replacement regressed confirmed reset sequence".into());
                }
                if snapshot.registry.generation != replacement.generation {
                    return Err("Retired graph reappeared after install".into());
                }
                if snapshot.sequence > previous
                    && snapshot.records.iter().any(|record| record.peak > 0.0)
                    && snapshot.transport.audio().is_some_and(|transport| {
                        (transport.audio.tempo_bpm - 121.0).abs() < 1e-6
                            && transport.audio.control_valid == 1
                            && transport.audio.control_generation == 1
                            && transport.audio.applied_sequence == 2
                            && transport.audio.owner_epoch > latest.audio.owner_epoch
                    })
                {
                    adopted = true;
                    break;
                }
            }
            std::thread::sleep(Duration::from_millis(8));
        }
        if !adopted {
            return Err("Replacement graph never published live samples".into());
        }
        println!(
            "Hub graph replacement {} -> {} retained monotonic sequence",
            registry.generation, replacement.generation
        );
        let stream_registry = service.meter_stream_registry("hub-smoke-main", stream.stream_id)?;
        if stream_registry.generation != replacement.generation
            || stream_registry.registry_revision <= stream.registry.registry_revision
        {
            return Err("Stream registry did not advance across graph replacement".into());
        }
        println!("Window-bound streams: foreign access rejected, sibling close isolated, registry advanced across graph replacement");
        let stop_control = serde_json::json!({
            "protocolVersion": 2, "sessionId": session, "sequence": 3,
            "controlGeneration": "2", "control": {
                "playing": false, "recording": false, "seekBar": 1, "seekGeneration": 0
            }
        });
        if execute(
            &main,
            service.control(&main, stop_control, lease.clone(), 0),
        )?["kind"]
            != "accepted"
        {
            return Err("Stopped graph probe control was rejected".into());
        }
        source_observations::verify_stopped(&service, &lease, &session, registry.sources.len())?;
        request["state"]["project"]["bpm"] = 122.into();
        request["state"]["project"]["numerator"] = 4.into();
        request["sequence"] = 4.into();
        request["baseRevision"] = 1.into();
        request["revision"] = 2.into();
        if execute(&main, service.apply(&main, request, lease.clone(), 0))?["kind"] != "accepted" {
            return Err("Stopped graph replacement was rejected".into());
        }
        let stopped = execute(&main, service.telemetry(&main, lease.clone()))?;
        if stopped["meterReady"] != false {
            return Err("Stopped replacement unexpectedly prepared playback".into());
        }
        let refreshed = execute(
            &main,
            service.refresh_meter_stream_registry(&main, "hub-smoke-main", stream.stream_id),
        )?;
        if !refreshed.entries.is_empty()
            || service
                .meter_stream_clock_probe("hub-smoke-main", stream.stream_id)?
                .is_some()
        {
            return Err(
                "Unprepared graph fabricated registered graph outputs or a sample clock".into(),
            );
        }
        stopped_transport::verify_seek(
            &service,
            &main,
            &lease,
            &session,
            initial_stopped,
            stream.stream_id,
        )?;
        let resume = serde_json::json!({"protocolVersion":2,"sessionId":session,"sequence":6,"controlGeneration":"9007199254740995","control":{"playing":true,"recording":false,"seekBar":9,"seekGeneration":1}});
        if execute(&main, service.control(&main, resume, lease.clone(), 0))?["kind"] != "accepted" {
            return Err("Resume after stopped replacement rejected".into());
        }
        stopped_transport::verify_playing(&service, &lease, &session, false, stream.stream_id)?;
        let resumed = execute(
            &main,
            service.refresh_meter_stream_registry(&main, "hub-smoke-main", stream.stream_id),
        )?;
        if resumed.generation <= replacement.generation {
            return Err("Resumed stream retained retired graph".into());
        }
        stopped_transport::verify_playing(&service, &lease, &session, true, stream.stream_id)?;
        println!(
            "Stopped time-signature replacement -> unprepared metadata -> resumed same stream generation {}",
            resumed.generation
        );
        Ok::<(), String>(())
    })();
    let released = execute(&main, service.release(&main, lease.clone()));
    result?;
    released?;
    if service.meter_snapshot(&lease, &session).is_ok() {
        return Err("Released lease retained Hub access".into());
    }
    if service.meter_stream_registry("hub-smoke-main", 1).is_ok() {
        return Err("Lease release retained meter stream".into());
    }
    println!("Final lease release fenced Hub access");
    Ok(())
}
