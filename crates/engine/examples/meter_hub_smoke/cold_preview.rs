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
    let source = request["state"]["project"]["sources"]
        .as_array()
        .and_then(|sources| sources.first())
        .ok_or("Cold Preview requires a source")?;
    let generation = service.reserve_audition()?;
    execute(main, service.audition(main, serde_json::json!({"generation":generation,"path":source["uri"],"mode":"raw","gainDb":-60})))?;
    let result: Result<(), String> = (|| {
        let registry = execute(
            main,
            service.refresh_meter_hub(main, lease.into(), session.into()),
        )?;
        let metadata = execute(
            main,
            service.refresh_meter_stream_registry(main, "hub-smoke-main", stream),
        )?;
        let preview = metadata
            .sources
            .iter()
            .find(|source| source.owner == SourceOwner::Preview)
            .ok_or_else(|| {
                format!(
                    "Cold Preview missing source metadata: graph={:?}, sources={}",
                    registry.graph,
                    metadata.sources.len()
                )
            })?;
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            if let Some(snapshot) = service.meter_snapshot(lease, session)? {
                if snapshot.sources.iter().any(|source| {
                    source.clip_handle == preview.clip_handle
                        && source.flags & SOURCE_FLAGS_VALID as u32 != 0
                        && source.source_frame > 0.0
                }) {
                    let frame = super::transport_frames::capture(
                        service,
                        stream,
                        "cold-preview",
                        |header| header.source_count > 0,
                    )?;
                    if !frame.sources.iter().any(|source| {
                        source.clip_handle == preview.clip_handle
                            && source.flags & SOURCE_FLAGS_VALID as u32 != 0
                            && source.source_frame > 0.0
                    }) {
                        return Err(
                            "Cold Preview source did not reach the production binary stream".into(),
                        );
                    }
                    println!("Cold Preview: graph={:?}, actual source frame without Arrangement playback",registry.graph);
                    return Ok(());
                }
            }
            if Instant::now() >= deadline {
                return Err("Cold Preview did not reach the shared source snapshot".into());
            }
            std::thread::sleep(Duration::from_millis(8));
        }
    })();
    let stopped = execute(main, service.audition_stop(main, generation));
    result?;
    stopped?;
    execute(
        main,
        service.refresh_meter_stream_registry(main, "hub-smoke-main", stream),
    )?;
    Ok(())
}
