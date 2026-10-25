use super::{execute, MainQueue};
use serde_json::Value;
use std::time::{Duration, Instant};
use zoeydaw_engine::{
    realtime::{metadata_generated::SourceOwner, protocol_generated::SOURCE_FLAGS_VALID},
    PlaybackService,
};

pub(super) fn verify(
    service: &PlaybackService,
    main: &MainQueue,
    request: &Value,
    lease: &str,
    session: &str,
    stream: u32,
) -> Result<(), String> {
    let original = service.meter_stream_registry("hub-smoke-main", stream)?;
    let tracks = request["state"]["project"]["tracks"]
        .as_array()
        .ok_or("Missing tracks")?;
    let expected = tracks
        .iter()
        .flat_map(|track| track["clips"].as_array().into_iter().flatten())
        .filter(|clip| clip["sourceId"].is_string())
        .count();
    if original.sources.len() != expected {
        return Err("Source registry did not cover the actual authored audio clips".into());
    }
    let source = request["state"]["project"]["sources"]
        .as_array()
        .and_then(|sources| sources.first())
        .ok_or("Source lifecycle smoke requires an actual audio source")?;
    let generation = service.reserve_audition()?;
    execute(
        main,
        service.audition(
            main,
            serde_json::json!({
                "generation":generation,"path":source["uri"],"mode":"raw","gainDb":-60
            }),
        ),
    )?;
    let result = (|| {
        execute(
            main,
            service.refresh_meter_hub(main, lease.into(), session.into()),
        )?;
        let until = Instant::now() + Duration::from_secs(2);
        loop {
            if service
                .meter_snapshot(lease, session)?
                .is_some_and(|snapshot| snapshot.registry.sources.len() == expected + 1)
            {
                break;
            }
            if Instant::now() >= until {
                return Err("Hub source registry did not observe Preview admission".into());
            }
            std::thread::sleep(Duration::from_millis(4));
        }
        if service
            .meter_stream_snapshot("hub-smoke-main", stream, 0)
            .err()
            .as_deref()
            != Some("meter-registry-required")
        {
            return Err("Source data was delivered before its new registry".into());
        }
        let registry = execute(
            main,
            service.refresh_meter_stream_registry(main, "hub-smoke-main", stream),
        )?
        .ok_or("Source registry lost its active graph")?;
        let preview = registry
            .sources
            .iter()
            .find(|mapping| mapping.owner == SourceOwner::Preview)
            .ok_or("Preview source identity was not registered")?;
        if registry.generation != original.generation
            || registry.registry_revision <= original.registry_revision
            || registry
                .sources
                .iter()
                .filter(|mapping| mapping.owner == SourceOwner::Arrangement)
                .cloned()
                .collect::<Vec<_>>()
                != original.sources
            || original.sources.iter().any(|mapping| {
                mapping.source_handle == preview.source_handle
                    || mapping.clip_handle == preview.clip_handle
            })
        {
            return Err("Preview source aliased authored identity or replaced its graph".into());
        }
        let until = Instant::now() + Duration::from_secs(2);
        let mut first = None;
        loop {
            if let Some(snapshot) = service.meter_snapshot(lease, session)? {
                if let Some(value) = snapshot.sources.iter().find(|value| {
                    value.clip_handle == preview.clip_handle
                        && value.flags & SOURCE_FLAGS_VALID as u32 != 0
                }) {
                    if let Some(frame) = first {
                        if value.source_frame > frame {
                            println!("Preview source reader: {} -> {} frames, independent identity, registry-before-data enforced", frame, value.source_frame);
                            break;
                        }
                    } else {
                        first = Some(value.source_frame);
                    }
                }
            }
            if Instant::now() >= until {
                return Err("Actual Preview source reader position did not advance".into());
            }
            std::thread::sleep(Duration::from_millis(8));
        }
        Ok::<(), String>(())
    })();
    let stopped = execute(main, service.audition_stop(main, generation));
    result?;
    stopped?;
    let removed = execute(
        main,
        service.refresh_meter_stream_registry(main, "hub-smoke-main", stream),
    )?
    .ok_or("Preview stop lost the Arrangement graph")?;
    if removed.sources != original.sources || removed.generation != original.generation {
        return Err("Preview stop retained its source or changed authored identity".into());
    }
    let snapshot = service
        .meter_snapshot(lease, session)?
        .ok_or("Missing source snapshot after Preview stop")?;
    if snapshot.sources.iter().any(|value| {
        !original
            .sources
            .iter()
            .any(|mapping| mapping.clip_handle == value.clip_handle)
    }) {
        return Err("Retired Preview source reappeared after registry publication".into());
    }
    println!("Preview stop removed its source mapping; authored sources and graph retained");
    Ok(())
}

pub(super) fn verify_stopped(
    service: &PlaybackService,
    lease: &str,
    session: &str,
    expected: usize,
) -> Result<(), String> {
    let until = Instant::now() + Duration::from_secs(2);
    loop {
        if let Some(snapshot) = service.meter_snapshot(lease, session)? {
            if snapshot.sources.len() == expected
                && snapshot
                    .sources
                    .iter()
                    .all(|source| source.flags & SOURCE_FLAGS_VALID as u32 == 0)
                && snapshot.transport.audio().is_some_and(|transport| {
                    transport.audio.playing == 0 && transport.audio.audible_valid == 0
                })
            {
                println!("Stopped Arrangement source activity follows actual audio transport");
                return Ok(());
            }
        }
        if Instant::now() >= until {
            return Err("Stopped Arrangement still published valid source activity".into());
        }
        std::thread::sleep(Duration::from_millis(8));
    }
}
