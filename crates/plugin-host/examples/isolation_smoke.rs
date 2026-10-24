use plughost::{
    BlockContext, Chain, Error, HostIdentity, Layout, PluginFormat, PluginRef, Timeouts,
};
use std::{path::PathBuf, time::Duration};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 2 {
        return Err("Usage: isolation_smoke HELPER FIXTURE_DIRECTORY".into());
    }
    let helper = PathBuf::from(&args[0]);
    for (format, extension, normal_id, crash_id) in [
        (
            PluginFormat::Clap,
            "clap",
            "com.studio.plughost.test-delay.79000001",
            "com.studio.plughost.test-delay.79000002",
        ),
        (
            PluginFormat::Vst3,
            "vst3",
            "706C7567686F737444656C6179000001",
            "706C7567686F737444656C6179000002",
        ),
    ] {
        let plugin = |name: &str, id: &str| PluginRef {
            format,
            bundle: Some(PathBuf::from(&args[1]).join(format!("plughost-test-{name}.{extension}"))),
            class_id: id.into(),
        };
        let spawn = |plugins: &[PluginRef]| -> Result<Chain, plughost::Error> {
            let mut chain = Chain::spawn(
                &helper,
                plugins,
                &HostIdentity::default(),
                Timeouts::default(),
            )?;
            let config = chain.main_bus_config(
                48_000.0,
                512,
                Layout::Stereo,
                &vec![Layout::Stereo; plugins.len()],
            )?;
            chain.prepare_audio(&config)?;
            Ok(chain)
        };
        let mut healthy = spawn(&[plugin("delay", normal_id)])?;
        let mut faulty = spawn(&[
            plugin("delay", normal_id),
            plugin("crash-in-process", crash_id),
        ])?;
        faulty.set_parameter(0, 0, 0.25)?;
        let snapshot = faulty.snapshot()?;
        let state_directory = tempfile::tempdir()?;
        let state_store = zoeydaw_plugin_host::state_store::PluginStateStore::new(
            state_directory.path().to_owned(),
        )?;
        let mut restored_states = Vec::with_capacity(snapshot.states.len());
        for state in &snapshot.states {
            let reference = state_store.save(state)?;
            restored_states.push(state_store.load(&reference, state.format, &state.class_id)?);
        }
        let monitor = faulty.helper_monitor();
        let healthy_monitor = healthy.helper_monitor();
        let input = [0.5_f32; 512];
        let mut left = [0.0_f32; 512];
        let mut right = [0.0_f32; 512];
        let mut events = Vec::with_capacity(4096);
        let failure = faulty.process_audio_f32(
            &BlockContext::new(512),
            &[&input, &input],
            &mut [&mut left, &mut right],
            &[],
            &[],
            &mut events,
        );
        if !matches!(failure, Err(Error::Crashed { slot: Some(1), .. })) {
            return Err(format!("Unexpected crash result: {failure:?}").into());
        }
        if monitor.wait_for_exit(Duration::from_secs(5)).is_none() {
            return Err("Crashed helper was not reaped".into());
        }
        for _ in 0..3 {
            healthy.process_audio_f32(
                &BlockContext::new(512),
                &[&input, &input],
                &mut [&mut left, &mut right],
                &[],
                &[],
                &mut events,
            )?;
        }
        if healthy_monitor.exit_status().is_some()
            || left
                .iter()
                .chain(&right)
                .any(|sample| (*sample - 0.5).abs() > 1e-6)
        {
            return Err("Unrelated helper output changed after another chain crashed".into());
        }
        let mut recovered = faulty.recover(&restored_states)?;
        if recovered.helper_monitor().process_id() == monitor.process_id() {
            return Err("Recovery reused dead helper".into());
        }
        let parameters = recovered.parameters(0)?;
        if !parameters
            .iter()
            .any(|(info, value)| info.id == 0 && (*value - 0.25).abs() < 1e-6)
        {
            return Err("Recovery lost saved gain".into());
        }
        let recovered_monitor = recovered.helper_monitor();
        drop(recovered);
        if recovered_monitor
            .wait_for_exit(Duration::from_secs(5))
            .is_none()
        {
            return Err("Recovered helper leaked on drop".into());
        }
        let hang_id = match format {
            PluginFormat::Clap => "com.studio.plughost.test-delay.79000003",
            PluginFormat::Vst3 => "706C7567686F737444656C6179000003",
            _ => unreachable!(),
        };
        let mut timeouts = Timeouts::default();
        timeouts.process = Duration::from_millis(100);
        let mut hung = Chain::spawn(
            &helper,
            &[plugin("hang-in-process", hang_id)],
            &HostIdentity::default(),
            timeouts,
        )?;
        let config = hung.main_bus_config(48_000.0, 512, Layout::Stereo, &[Layout::Stereo])?;
        hung.prepare_audio(&config)?;
        let hung_monitor = hung.helper_monitor();
        let started = std::time::Instant::now();
        let result = hung.process_audio_f32(
            &BlockContext::new(512),
            &[&input, &input],
            &mut [&mut left, &mut right],
            &[],
            &[],
            &mut events,
        );
        if !matches!(result, Err(Error::TimedOut { .. }))
            || started.elapsed() > Duration::from_secs(5)
        {
            return Err(format!("Hung helper did not fail within its deadline: {result:?}").into());
        }
        if hung_monitor.wait_for_exit(Duration::from_secs(5)).is_none() {
            return Err("Hung helper was not terminated and reaped".into());
        }
        healthy.process_audio_f32(
            &BlockContext::new(512),
            &[&input, &input],
            &mut [&mut left, &mut right],
            &[],
            &[],
            &mut events,
        )?;
        if left
            .iter()
            .chain(&right)
            .any(|sample| (*sample - 0.5).abs() > 1e-6)
        {
            return Err("Hung helper changed independent chain output".into());
        }
        let mut realtime_hung = spawn(&[plugin("hang-in-process", hang_id)])?;
        let snapshot = realtime_hung.snapshot()?;
        let realtime_endpoint = realtime_hung.realtime_endpoint(
            &plughost::RealtimeConfig::new(512).with_fallback(plughost::Fallback::Dry),
        )?;
        realtime_hung.start_realtime()?;
        let old_monitor = realtime_hung.helper_monitor();
        let mut realtime_endpoint = zoeydaw_plugin_host::quantum::QuantumAudio::new(
            realtime_endpoint,
            512,
            2,
            2,
            48_000.0,
        )?;
        let mut maximum_callback = Duration::ZERO;
        for _ in 0..16 {
            std::thread::sleep(Duration::from_millis(15));
            events.clear();
            let started = std::time::Instant::now();
            realtime_endpoint.process(
                &[&input, &input],
                &mut [&mut left, &mut right],
                512,
                &[],
                &[],
                &mut events,
                None,
            )?;
            maximum_callback = maximum_callback.max(started.elapsed());
        }
        let status = realtime_hung
            .realtime_status()
            .ok_or("Realtime status missing")?;
        if !status.resync
            || status.stalled < Duration::from_millis(100)
            || maximum_callback > Duration::from_millis(50)
            || left
                .iter()
                .chain(&right)
                .any(|sample| (*sample - 0.5).abs() > 1e-6)
        {
            return Err(format!(
                "Realtime hang failed dry fallback: {status:?}, callback {maximum_callback:?}"
            )
            .into());
        }
        let replacement = realtime_hung.recover_realtime(&snapshot)?;
        if replacement.helper_monitor().process_id() == old_monitor.process_id() {
            return Err("Realtime recovery reused the hung process".into());
        }
        drop(realtime_hung);
        if old_monitor.wait_for_exit(Duration::from_secs(5)).is_none() {
            return Err("Retired realtime helper did not exit".into());
        }
        events.clear();
        realtime_endpoint.process(
            &[&input, &input],
            &mut [&mut left, &mut right],
            512,
            &[],
            &[],
            &mut events,
            None,
        )?;
        let replacement_monitor = replacement.helper_monitor();
        drop(replacement);
        if replacement_monitor
            .wait_for_exit(Duration::from_secs(5))
            .is_none()
        {
            return Err("Replacement realtime helper did not exit".into());
        }
        println!(
            "{format:?}: realtime hang returns delayed dry audio; max observed callback {maximum_callback:?}; explicit endpoint recovery changes helper"
        );
        println!(
            "{format:?}: crash and hang isolated, independent chain retains exact output, explicit recovery restores state and releases helper"
        );
    }
    Ok(())
}
