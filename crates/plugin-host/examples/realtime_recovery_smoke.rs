use plughost::{
    Chain, Layout, PluginFormat, PluginRef, RealtimeConfig, RealtimeOutput, Timeouts,
};
use std::{path::PathBuf, time::Duration};

#[path = "../../../third_party/plughost/crates/plughost/tests/support/stall.rs"]
mod stall;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 2 {
        return Err("Usage: realtime_recovery_smoke HELPER FIXTURE_DIRECTORY".into());
    }
    let mut barrier = stall::Stall::new();
    let plugin = PluginRef {
        format: PluginFormat::Clap,
        bundle: Some(PathBuf::from(&args[1]).join("plughost-test-stall-in-process.clap")),
        class_id: "com.studio.plughost.test-delay.79000018".into(),
    };
    let mut chain = Chain::spawn(
        &PathBuf::from(&args[0]),
        &[plugin],
        &barrier.identity(),
        Timeouts::default(),
    )?;
    let config = chain.main_bus_config(48_000.0, 512, Layout::Stereo, &[Layout::Stereo])?;
    chain.prepare_audio(&config)?;
    chain.set_parameter(0, 0, 0.25)?;
    let snapshot = chain.snapshot()?;
    let endpoint = chain.realtime_endpoint(&RealtimeConfig::new(512))?;
    chain.start_realtime()?;
    let mut endpoint =
        zoeydaw_plugin_host::quantum::QuantumAudio::new(endpoint, 512, 2, 2, 48_000.0)?;
    let input = [0.5_f32; 512];
    let mut left = [0.0_f32; 512];
    let mut right = [0.0_f32; 512];
    let mut events = Vec::with_capacity(4096);
    let mut process = |endpoint: &mut zoeydaw_plugin_host::quantum::QuantumAudio| {
        std::thread::sleep(Duration::from_millis(15));
        events.clear();
        let result = endpoint.process(
            &[&input, &input],
            &mut [&mut left, &mut right],
            512,
            &[],
            &[],
            &mut events,
            None,
        )?;
        Ok::<_, zoeydaw_plugin_host::quantum::QuantumError>((result, left, right))
    };
    for _ in 0..9 {
        process(&mut endpoint)?;
    }
    barrier.wait_until_entered();
    for _ in 0..10 {
        process(&mut endpoint)?;
    }
    let status = chain.realtime_status().ok_or("Missing realtime status")?;
    if !status.resync || status.stalled < Duration::from_millis(100) {
        return Err("Controlled stall was not observed".into());
    }
    let old = chain.helper_monitor();
    let mut recovered = chain.recover_realtime(&snapshot)?;
    if old.exit_status().is_some() {
        return Err("Old helper exited before explicit retirement".into());
    }
    for index in 0..6 {
        let (result, left, right) = process(&mut endpoint)?;
        if index >= 3
            && (result != Some(RealtimeOutput::Processed)
                || left
                    .iter()
                    .chain(&right)
                    .any(|sample| (*sample - 0.125).abs() > 1e-6))
        {
            return Err(format!(
                "Recovered endpoint did not restore saved gain output at block {index}"
            )
            .into());
        }
    }
    drop(chain);
    if old.wait_for_exit(Duration::from_secs(5)).is_none() {
        return Err("Retired helper did not exit".into());
    }
    drop(barrier);
    recovered.stop_realtime()?;
    println!(
        "Controlled realtime stall: same QuantumAudio endpoint adopts new helper and outputs exact saved gain before old helper retirement"
    );
    Ok(())
}
