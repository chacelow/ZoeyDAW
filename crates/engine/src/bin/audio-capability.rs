use firewheel::cpal::cpal::{self, traits::HostTrait};
use serde_json::json;

fn main() {
    let capability = match cpal::default_host().default_output_device() {
        Some(device) => json!({ "kind": "available", "device": device.to_string() }),
        None => json!({
            "kind": "unavailable",
            "reason": "No default audio output device is available on this host"
        }),
    };
    println!("{capability}");
}
