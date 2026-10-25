use std::{
    collections::BTreeSet,
    time::{Duration, Instant},
};
use zoeydaw_engine::{
    realtime::{
        levels::decode_levels,
        metadata_generated::{MeterInterest, MeterRateHz},
        protocol_generated::RECORD_FLAGS_VALID,
    },
    PlaybackService,
};

pub(super) fn capture(service: &PlaybackService, lease: &str, session: &str) -> Result<(), String> {
    let window = "hub-smoke-consumers";
    let opened = service.open_meter_stream(window, lease, session)?;
    let result: Result<usize, String> = (|| {
        let endpoints: Vec<_> = opened
            .registry
            .entries
            .iter()
            .map(|entry| entry.endpoint_id.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        service.set_meter_interest(
            window,
            MeterInterest {
                stream_id: opened.stream_id,
                revision: 1,
                endpoint_ids: endpoints,
                transport: true,
                rate_hz: MeterRateHz::Value60,
                visible: true,
            },
        )?;
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let bytes = service.meter_stream_snapshot(window, opened.stream_id, 0)?;
            if !bytes.is_empty() {
                let frame =
                    decode_levels(&bytes).ok_or("All-endpoint consumer frame failed decoding")?;
                if frame.records.len() == opened.registry.entries.len()
                    && frame.records.iter().any(|record| {
                        record.flags & RECORD_FLAGS_VALID as u32 != 0 && record.peak > 0.0
                    })
                {
                    if let Some(directory) = std::env::args().nth(2) {
                        std::fs::write(
                            std::path::Path::new(&directory).join("meter-consumers.bin"),
                            &bytes,
                        )
                        .map_err(|error| error.to_string())?;
                        std::fs::write(
                            std::path::Path::new(&directory).join("meter-consumers.registry.json"),
                            serde_json::to_vec(&opened.registry)
                                .map_err(|error| error.to_string())?,
                        )
                        .map_err(|error| error.to_string())?;
                    }
                    return Ok(frame.records.len());
                }
            }
            if Instant::now() >= deadline {
                return Err(
                    "All-endpoint consumer frame never contained live native records".into(),
                );
            }
            std::thread::sleep(Duration::from_millis(8));
        }
    })();
    let closed = service.close_meter_stream(window, opened.stream_id);
    let records = result?;
    closed?;
    println!("Production meter consumers: {records} actual records, all endpoint interests, isolated window stream closed");
    Ok(())
}
