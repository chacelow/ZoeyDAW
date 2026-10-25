use std::time::{Duration, Instant};
use zoeydaw_engine::{
    realtime::{
        levels::{decode_levels, LevelsFrame},
        protocol_generated::WireHeader,
    },
    PlaybackService,
};

pub(super) fn capture(
    service: &PlaybackService,
    stream: u32,
    name: &str,
    matches: impl Fn(&WireHeader) -> bool,
) -> Result<LevelsFrame, String> {
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let bytes = service.meter_stream_snapshot("hub-smoke-main", stream, 0)?;
        if !bytes.is_empty() {
            let frame = decode_levels(&bytes)
                .ok_or("Production stream returned an invalid transport frame")?;
            if matches(&frame.header) {
                if let Some(directory) = std::env::args().nth(2) {
                    std::fs::write(
                        std::path::Path::new(&directory).join(format!("{name}.bin")),
                        &bytes,
                    )
                    .map_err(|error| error.to_string())?;
                    let registry = service.meter_stream_registry("hub-smoke-main", stream)?;
                    std::fs::write(
                        std::path::Path::new(&directory).join(format!("{name}.registry.json")),
                        serde_json::to_vec(&registry).map_err(|error| error.to_string())?,
                    )
                    .map_err(|error| error.to_string())?;
                }
                println!("Production transport frame {name}: kind={} owner={} control={} applied={} slots={} bytes={}",
                    frame.header.transport_kind, frame.header.owner_epoch, frame.header.control_generation,
                    frame.header.applied_sequence, frame.records.len(), bytes.len());
                return Ok(frame);
            }
        }
        if Instant::now() >= deadline {
            return Err(format!(
                "Production transport frame {name} never matched its actual state"
            ));
        }
        std::thread::sleep(Duration::from_millis(8));
    }
}
