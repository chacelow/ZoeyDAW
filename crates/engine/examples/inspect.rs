use zoeydaw_engine::{
    peaks::PeakPyramid,
    protocol::{BackendRequest, SessionFence},
    transport::{Transport, TransportClock},
};

fn main() {
    let request: BackendRequest = serde_json::from_value(serde_json::json!({
        "protocolVersion": 1, "sessionId": "inspect", "sequence": 0,
        "baseRevision": 0, "revision": 0, "stage": "open", "editId": null,
        "state": {
            "project": { "bpm": 120, "numerator": 4, "denominator": 4,
                "loop": { "enabled": true, "startBar": 2, "endBar": 3 },
                "sources": [], "tracks": [] },
            "control": { "playing": true, "recording": false, "seekBar": 2.999,
                "seekGeneration": 0, "heldNotes": [], "midiVelocity": 100 }
        }
    }))
    .unwrap();
    let mut fence = SessionFence::new();
    println!(
        "open={}",
        serde_json::to_string(&fence.apply(&request)).unwrap()
    );
    println!(
        "duplicate={}",
        serde_json::to_string(&fence.apply(&request)).unwrap()
    );
    let state = fence.state().unwrap();
    let mut transport = Transport::from_control(
        TransportClock::new(48_000, 0.5).unwrap(),
        &state.project,
        &state.control,
    );
    let advance = transport.advance(256);
    let segments: Vec<_> = advance.segments.collect();
    println!(
        "render_ranges={segments:?} next_frame={}",
        advance.position_frame
    );
    println!(
        "clock={}",
        serde_json::to_string(&transport.to_backend_clock()).unwrap()
    );
    let sine: Vec<_> = (0..4800)
        .map(|frame| 0.5 * (std::f32::consts::TAU * 1000.0 * frame as f32 / 48_000.0).sin())
        .collect();
    let pyramid = PeakPyramid::build(&[&sine], 480, 5);
    for (level, peaks) in pyramid.levels().iter().enumerate() {
        let channel = &peaks.channels[0];
        println!("peaks level={level} frames_per_bin={} bins={} first_min={:.6} first_max={:.6} symmetry={:.9}",
            peaks.frames_per_bin, channel.min.len(), channel.min[0], channel.max[0], channel.min[0]+channel.max[0]);
    }
}
