use plughost::{Chain, HostIdentity, Layout, PluginFormat, PluginRef, RealtimeConfig, Timeouts};
use std::path::PathBuf;
use zoeydaw_plugin_host::{
    native::NativeProcessor,
    quantum::QuantumAudio,
};
use zoeydaw_plugin_abi::OwnedNativeProcessor;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 3 {
        return Err(
            "Usage: native_graph_smoke HELPER FIXTURE_DIRECTORY NATIVE_PROBE_LIBRARY".into(),
        );
    }
    let plugin = PluginRef {
        format: PluginFormat::Clap,
        bundle: Some(PathBuf::from(&args[1]).join("plughost-test-delay.clap")),
        class_id: "com.studio.plughost.test-delay.79000001".into(),
    };
    let mut chain = Chain::spawn(
        &PathBuf::from(&args[0]),
        &[plugin],
        &HostIdentity::default(),
        Timeouts::default(),
    )?;
    let config = chain.main_bus_config(48_000.0, 512, Layout::Stereo, &[Layout::Stereo])?;
    chain.prepare_audio(&config)?;
    let mut dry_chain = Chain::spawn(
        &PathBuf::from(&args[0]),
        &[PluginRef {
            format: PluginFormat::Clap,
            bundle: Some(PathBuf::from(&args[1]).join("plughost-test-delay.clap")),
            class_id: "com.studio.plughost.test-delay.79000001".into(),
        }],
        &HostIdentity::default(),
        Timeouts::default(),
    )?;
    dry_chain.prepare_audio(&config)?;
    let dry_endpoint = dry_chain.realtime_endpoint(&RealtimeConfig::new(512))?;
    let dry_latency = dry_chain.start_realtime()? + 512;
    let dry_processor = NativeProcessor::new(QuantumAudio::new(dry_endpoint, 512, 2, 2, 48_000.0)?);
    let endpoint = chain.realtime_endpoint(&RealtimeConfig::new(512))?;
    let latency = chain.start_realtime()? + 512;
    let processor = NativeProcessor::new(QuantumAudio::new(endpoint, 512, 2, 2, 48_000.0)?);
    let mut instrument = Chain::spawn(
        &PathBuf::from(&args[0]),
        &[PluginRef {
            format: PluginFormat::Clap,
            bundle: Some(PathBuf::from(&args[1]).join("plughost-test-synth.clap")),
            class_id: "com.studio.plughost.test-synth".into(),
        }],
        &HostIdentity::default(),
        Timeouts::default(),
    )?;
    let instrument_config =
        instrument.main_bus_config(48_000.0, 512, Layout::None, &[Layout::Stereo])?;
    instrument.prepare_audio(&instrument_config)?;
    let instrument_endpoint = instrument.realtime_endpoint(&RealtimeConfig::new(512))?;
    let instrument_latency = instrument.start_realtime()? + 512;
    let instrument_processor =
        NativeProcessor::new(QuantumAudio::new(instrument_endpoint, 512, 0, 2, 48_000.0)?);
    // The local probe consumes each processor and releases it after graph retirement on this thread.
    unsafe {
        let library = libloading::Library::new(&args[2])?;
        let run: libloading::Symbol<unsafe extern "C" fn(OwnedNativeProcessor, u32, u32) -> i32> =
            library.get(b"zd_verify_isolated_graph")?;
        let status = run(processor.into_owned(), latency, 0);
        if status != 0 {
            return Err(format!("Tracktion/helper graph verification failed: {status}").into());
        }
        let status = run(dry_processor.into_owned(), dry_latency, 1);
        if status != 0 {
            return Err(format!("Tracktion PDC alignment failed: {status}").into());
        }
        dry_chain.stop_realtime()?;
        dry_chain.reset()?;
        dry_chain.set_parameter(0, 0, 0.25)?;
        let bypass_endpoint = dry_chain.realtime_endpoint(&RealtimeConfig::new(512))?;
        let bypass_latency = dry_chain.start_realtime()? + 512;
        let bypass_processor =
            NativeProcessor::new(QuantumAudio::new(bypass_endpoint, 512, 2, 2, 48_000.0)?);
        let status = run(bypass_processor.into_owned(), bypass_latency, 2);
        if status != 0 {
            return Err(format!("Isolated compensated bypass failed: {status}").into());
        }
        dry_chain.stop_realtime()?;
        dry_chain.reset()?;
        let endpoint = dry_chain.realtime_endpoint(&RealtimeConfig::new(512))?;
        let parameter_latency = dry_chain.start_realtime()? + 512;
        let processor = NativeProcessor::new(QuantumAudio::new(endpoint, 512, 2, 2, 48_000.0)?);
        let status = run(processor.into_owned(), parameter_latency, 3);
        if status != 0 {
            return Err(format!("Isolated live parameter snapshot failed: {status}").into());
        }
        let run_instrument: libloading::Symbol<
            unsafe extern "C" fn(OwnedNativeProcessor, u32) -> i32,
        > = library.get(b"zd_verify_isolated_instrument")?;
        let status = run_instrument(instrument_processor.into_owned(), instrument_latency);
        if status != 0 {
            return Err(format!("Tracktion instrument timing failed: {status}").into());
        }
        instrument.stop_realtime()?;
        instrument.reset()?;
        let endpoint = instrument.realtime_endpoint(&RealtimeConfig::new(512))?;
        let edit_latency = instrument.start_realtime()? + 512;
        let processor = NativeProcessor::new(QuantumAudio::new(endpoint, 512, 0, 2, 48_000.0)?);
        let run_edit: libloading::Symbol<unsafe extern "C" fn(OwnedNativeProcessor, u32) -> i32> =
            library.get(b"zd_verify_isolated_edit")?;
        let status = run_edit(processor.into_owned(), edit_latency);
        if status != 0 {
            return Err(format!("Retained Edit isolated instrument failed: {status}").into());
        }
    }
    chain.stop_realtime()?;
    dry_chain.stop_realtime()?;
    instrument.stop_realtime()?;
    println!(
        "Real Tracktion Node and retained Edit -> C ABI -> Rust -> isolated CLAP: impulses at {latency} frames, dry branch PDC and MIDI instrument onset/release passed"
    );
    Ok(())
}
