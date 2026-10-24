use std::{path::PathBuf, time::Duration};
use zoeydaw_plugin_host::{PluginCatalog, scan_operation::ScanOperations};

struct CallbackAllocator;
thread_local! {
    static IN_CALLBACK: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
    static ALLOCATIONS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}
unsafe impl std::alloc::GlobalAlloc for CallbackAllocator {
    unsafe fn alloc(&self, layout: std::alloc::Layout) -> *mut u8 {
        if IN_CALLBACK.try_with(|active| active.get()).unwrap_or(false) {
            ALLOCATIONS.with(|count| count.set(count.get() + 1));
        }
        unsafe { std::alloc::GlobalAlloc::alloc(&std::alloc::System, layout) }
    }
    unsafe fn dealloc(&self, pointer: *mut u8, layout: std::alloc::Layout) {
        unsafe { std::alloc::GlobalAlloc::dealloc(&std::alloc::System, pointer, layout) }
    }
}
#[global_allocator]
static ALLOCATOR: CallbackAllocator = CallbackAllocator;

fn callback<T>(action: impl FnOnce() -> T) -> T {
    struct Guard;
    impl Drop for Guard {
        fn drop(&mut self) {
            IN_CALLBACK.with(|active| active.set(false));
        }
    }
    ALLOCATIONS.with(|count| count.set(0));
    IN_CALLBACK.with(|active| active.set(true));
    let guard = Guard;
    let result = action();
    drop(guard);
    assert_eq!(
        ALLOCATIONS.with(|count| count.get()),
        0,
        "Audio callback allocated"
    );
    result
}

fn main() -> Result<(), String> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 3 {
        return Err("Usage: catalog_smoke HELPER FIXTURE_DIRECTORY NEW_CACHE_PATH".into());
    }
    let cache = PathBuf::from(&args[2]);
    if cache.exists() {
        return Err("Smoke cache must not already exist".into());
    }
    let mut catalog = PluginCatalog::new(PathBuf::from(&args[0]), cache.clone())?;
    let operations = ScanOperations::default();
    operations.reserve("smoke".into(), "initial".into())?;
    let initial = operations.begin("smoke".into(), "initial".into())?;
    let report = catalog.scan(&[PathBuf::from(&args[1])], &[], &initial, &|_| {})?;
    drop(initial);
    if report.cancelled || !report.issues.is_empty() {
        return Err(format!("Fixture scan failed: {:?}", report.issues));
    }
    drop(catalog);
    let mut catalog = PluginCatalog::new(PathBuf::from(&args[0]), cache.clone())?;
    if serde_json::to_value(catalog.entries()).map_err(|error| error.to_string())?
        != serde_json::to_value(&report.entries).map_err(|error| error.to_string())?
    {
        return Err("Authorized catalog changed after reopening without scanning".into());
    }
    let entry = report
        .entries
        .iter()
        .find(|entry| entry.plugin.class_id == "com.studio.plughost.test-delay.79000001")
        .ok_or("Expected CLAP delay fixture is absent")?;
    if catalog.spawn_chain(&["unregistered-plugin".into()]).is_ok() {
        return Err("Unknown catalog identity loaded".into());
    }
    verify_device_worker(&catalog, &entry.catalog_id)?;
    let mut chain = catalog.spawn_chain(&[entry.catalog_id.clone()])?;
    let config = chain
        .main_bus_config(
            48_000.0,
            512,
            plughost::Layout::Stereo,
            &[plughost::Layout::Stereo],
        )
        .map_err(|e| e.to_string())?;
    chain.prepare_audio(&config).map_err(|e| e.to_string())?;
    let endpoint = chain
        .realtime_endpoint(&plughost::RealtimeConfig::new(512))
        .map_err(|e| e.to_string())?;
    let latency = chain.start_realtime().map_err(|e| e.to_string())?;
    if latency != 992 {
        return Err(format!("Unexpected pipeline latency: {latency}"));
    }
    let mut endpoint =
        zoeydaw_plugin_host::quantum::QuantumAudio::new(endpoint, 512, 2, 2, 48_000.0)?;
    let latency = latency as usize + endpoint.added_latency();
    let mut left = [0.0_f32; 512];
    let mut right = [0.0_f32; 512];
    let mut impulses = Vec::new();
    let mut produced = Vec::with_capacity(8192);
    let invalid_note = zoeydaw_plugin_host::quantum::MidiMessage {
        offset: 128,
        port: 0,
        bytes: [0x90, 60, 100],
    };
    let rejected = callback(|| {
        endpoint.process(
            &[&[0.0; 128], &[0.0; 128]],
            &mut [&mut left[..128], &mut right[..128]],
            128,
            &[invalid_note],
            &[],
            &mut produced,
            None,
        )
    });
    if !matches!(
        rejected,
        Err(zoeydaw_plugin_host::quantum::QuantumError::EventOffset)
    ) {
        return Err("Invalid event offset was not rejected before advancing audio".into());
    }
    let overflow = vec![
        zoeydaw_plugin_host::quantum::MidiMessage {
            offset: 0,
            port: 0,
            bytes: [0x90, 60, 100],
        };
        4097
    ];
    let rejected = callback(|| {
        endpoint.process(
            &[&[0.0; 128], &[0.0; 128]],
            &mut [&mut left[..128], &mut right[..128]],
            128,
            &overflow,
            &[],
            &mut produced,
            None,
        )
    });
    if !matches!(
        rejected,
        Err(zoeydaw_plugin_host::quantum::QuantumError::EventCapacity)
    ) {
        return Err("Oversized event block was not rejected before advancing audio".into());
    }
    let mut native = zoeydaw_plugin_host::native::NativeProcessor::new(endpoint);
    let native_callback = native.callback();
    let mut native_events = vec![zoeydaw_plugin_abi::NativeMidi::default(); 8192];
    for block in 0..12 {
        std::thread::sleep(Duration::from_millis(15));
        let mut input = [0.0_f32; 512];
        if block == 4 {
            input[17] = 0.5;
        }
        for offset in (0..512).step_by(128) {
            let inputs = [input[offset..].as_ptr(), input[offset..].as_ptr()];
            let outputs = [left[offset..].as_mut_ptr(), right[offset..].as_mut_ptr()];
            let mut block = zoeydaw_plugin_abi::NativeBlock {
                inputs: inputs.as_ptr(),
                outputs: outputs.as_ptr(),
                midi: std::ptr::null(),
                automation: std::ptr::null(),
                produced: native_events.as_mut_ptr(),
                transport: std::ptr::null(),
                frames: 128,
                input_channels: 2,
                output_channels: 2,
                midi_count: 0,
                automation_count: 0,
                produced_capacity: 8192,
                produced_count: 0,
            };
            // Buffers and processor remain alive and exclusively borrowed for this synchronous call.
            let status = callback(|| unsafe {
                (native_callback.process)(native_callback.context, &mut block)
            });
            if status < 0 {
                return Err(format!("Native processor failed with status {status}"));
            }
        }
        for i in 0..512 {
            if left[i].abs() > 0.01 {
                impulses.push(block * 512 + i);
            }
            if left[i] != right[i] {
                return Err("Stereo fixture output diverged".into());
            }
        }
    }
    if impulses != [4 * 512 + 17 + latency] {
        return Err(format!("Unexpected impulse frames: {impulses:?}"));
    }
    chain.stop_realtime().map_err(|e| e.to_string())?;
    let synth = report
        .entries
        .iter()
        .find(|entry| entry.plugin.class_id == "com.studio.plughost.test-synth")
        .ok_or("Expected CLAP instrument fixture is absent")?;
    let mut instrument = catalog.spawn_chain(&[synth.catalog_id.clone()])?;
    let config = instrument
        .main_bus_config(
            48_000.0,
            512,
            plughost::Layout::None,
            &[plughost::Layout::Stereo],
        )
        .map_err(|e| e.to_string())?;
    instrument
        .prepare_audio(&config)
        .map_err(|e| e.to_string())?;
    let synth_endpoint = instrument
        .realtime_endpoint(&plughost::RealtimeConfig::new(512))
        .map_err(|e| e.to_string())?;
    let synth_latency = instrument.start_realtime().map_err(|e| e.to_string())? as usize + 512;
    let mut synth_endpoint =
        zoeydaw_plugin_host::quantum::QuantumAudio::new(synth_endpoint, 512, 0, 2, 48_000.0)?;
    let mut rendered = Vec::new();
    for block in 0..10 {
        std::thread::sleep(Duration::from_millis(15));
        for offset in (0..512).step_by(128) {
            let note = zoeydaw_plugin_host::quantum::MidiMessage {
                offset: 17,
                port: 0,
                bytes: if block == 3 {
                    [0x90, 69, 100]
                } else {
                    [0x80, 69, 0]
                },
            };
            let notes = if offset == 128 && matches!(block, 3 | 5) {
                std::slice::from_ref(&note)
            } else {
                &[]
            };
            produced.clear();
            callback(|| {
                synth_endpoint.process(
                    &[],
                    &mut [
                        &mut left[offset..offset + 128],
                        &mut right[offset..offset + 128],
                    ],
                    128,
                    notes,
                    &[],
                    &mut produced,
                    None,
                )
            })
            .map_err(|error| error.to_string())?;
        }
        rendered.extend_from_slice(&left);
    }
    let on = 3 * 512 + 145 + synth_latency;
    let off = 5 * 512 + 145 + synth_latency;
    if rendered[..on].iter().any(|sample| sample.abs() > 1e-6)
        || rendered[on..off]
            .iter()
            .map(|sample| sample * sample)
            .sum::<f32>()
            < 0.01
        || rendered[off..].iter().any(|sample| sample.abs() > 1e-6)
    {
        return Err("Segmented MIDI note timing or instrument output failed".into());
    }
    instrument.stop_realtime().map_err(|e| e.to_string())?;
    let routing = report
        .entries
        .iter()
        .find(|entry| entry.plugin.class_id == "com.studio.plughost.test-routing")
        .ok_or("Expected CLAP routing fixture is absent")?;
    let mut automated = catalog.spawn_chain(&[routing.catalog_id.clone()])?;
    let config = automated
        .main_bus_config(
            48_000.0,
            512,
            plughost::Layout::Stereo,
            &[plughost::Layout::Stereo],
        )
        .map_err(|e| e.to_string())?;
    automated
        .prepare_audio(&config)
        .map_err(|e| e.to_string())?;
    let automation_endpoint = automated
        .realtime_endpoint(&plughost::RealtimeConfig::new(512))
        .map_err(|e| e.to_string())?;
    let automation_latency = automated.start_realtime().map_err(|e| e.to_string())? as usize + 512;
    let mut automation_endpoint =
        zoeydaw_plugin_host::quantum::QuantumAudio::new(automation_endpoint, 512, 2, 2, 48_000.0)?;
    let constant = [0.5_f32; 512];
    let mut automated_samples = Vec::new();
    let mut returned_notes = Vec::new();
    let mut position: usize = 0;
    let segments: [usize; 4] = [63, 193, 127, 257];
    let mut segment = 0;
    while position < 5120 {
        std::thread::sleep(Duration::from_millis(15));
        let frames = segments[segment % segments.len()].min(5120 - position);
        let block = if position <= 3 * 512 + 273 { 3 } else { 5 };
        let point_at: usize = block * 512 + 273;
        let note_block = if position <= 3 * 512 + 151 { 3 } else { 5 };
        let note_at: usize = note_block * 512 + 151;
        let point = plughost::AutomationEvent {
            slot: 0,
            change: plughost::ParameterChange {
                id: 0,
                offset: point_at.saturating_sub(position),
                value: if block == 3 { 0.25 } else { 0.75 },
            },
        };
        let points = if position <= point_at && point_at < position + frames {
            std::slice::from_ref(&point)
        } else {
            &[]
        };
        let note = zoeydaw_plugin_host::quantum::MidiMessage {
            offset: note_at.saturating_sub(position),
            port: 0,
            bytes: if note_block == 3 {
                [0x90, 60, 100]
            } else {
                [0x80, 60, 0]
            },
        };
        let notes = if position <= note_at && note_at < position + frames {
            std::slice::from_ref(&note)
        } else {
            &[]
        };
        produced.clear();
        callback(|| {
            automation_endpoint.process(
                &[&constant[..frames], &constant[..frames]],
                &mut [&mut left[..frames], &mut right[..frames]],
                frames,
                notes,
                points,
                &mut produced,
                None,
            )
        })
        .map_err(|error| error.to_string())?;
        for event in &produced {
            if let Some(bytes) = event.data.to_midi() {
                if matches!(bytes[0] & 0xf0, 0x80 | 0x90) {
                    returned_notes.push((position + event.offset, bytes));
                }
            }
        }
        automated_samples.extend_from_slice(&left[..frames]);
        position += frames;
        segment += 1;
    }
    let first = 3 * 512 + 273 + automation_latency;
    let second = 5 * 512 + 273 + automation_latency;
    if automated_samples[first..second]
        .iter()
        .any(|sample| (*sample - 0.125).abs() > 1e-6)
        || automated_samples[second..]
            .iter()
            .any(|sample| (*sample - 0.375).abs() > 1e-6)
    {
        return Err("Segmented automation changed at the wrong sample or value".into());
    }
    if returned_notes
        != [
            (3 * 512 + 151 + automation_latency, [0x90, 72, 100]),
            (5 * 512 + 151 + automation_latency, [0x80, 72, 0]),
        ]
    {
        return Err(format!(
            "Segmented MIDI output lost timing or identity: {returned_notes:?}"
        ));
    }
    automated.stop_realtime().map_err(|e| e.to_string())?;
    let before = catalog.entries();
    operations.reserve("smoke".into(), "cancel-during-scan".into())?;
    let lease = operations.begin("smoke".into(), "cancel-during-scan".into())?;
    let report = catalog.scan(&[PathBuf::from(&args[1])], &[], &lease, &|_| {
        operations.cancel("smoke", "cancel-during-scan").unwrap();
    })?;
    if operations.begin("smoke".into(), "next".into()).is_ok() {
        return Err("Scan admission released before worker cleanup".into());
    }
    drop(lease);
    operations.reserve("smoke".into(), "next".into())?;
    let _next = operations.begin("smoke".into(), "next".into())?;
    if !report.cancelled
        || report
            .entries
            .iter()
            .map(|e| &e.catalog_id)
            .collect::<Vec<_>>()
            != before.iter().map(|e| &e.catalog_id).collect::<Vec<_>>()
    {
        return Err("Cancelled scan replaced the catalog".into());
    }
    std::fs::remove_file(&cache).map_err(|e| e.to_string())?;
    let reopened = PluginCatalog::new(PathBuf::from(&args[0]), cache.clone())?;
    if serde_json::to_value(reopened.entries()).map_err(|error| error.to_string())?
        != serde_json::to_value(&before).map_err(|error| error.to_string())?
    {
        return Err(
            "Cancelled scan changed durable authorization or scanner cache deletion erased it"
                .into(),
        );
    }
    std::fs::remove_file(cache.with_extension("authorized.json"))
        .map_err(|error| error.to_string())?;
    println!(
        "Catalog restart/admission/cancellation, effect latency, segmented MIDI/automation timing and zero host callback allocations passed"
    );
    Ok(())
}

fn verify_device_worker(catalog: &PluginCatalog, id: &str) -> Result<(), String> {
    use zoeydaw_plugin_host::device_session::PreparedDevice;
    use zoeydaw_plugin_abi::NativeBlock;
    let device = PreparedDevice::prepare(catalog.select(id)?, 48_000.0, 512, None)?;
    device.control.set_parameter(0, 0.25)?;
    let state = device.control.snapshot()?;
    let monitor = device.monitor.clone();
    let latency = device.latency_frames;
    let audio = unsafe { device.audio.into_owned() };
    drop(device.control);
    if monitor.exit_status().is_some() {
        return Err("Helper exited while native graph still owns audio".into());
    }
    let input = [0.5_f32; 512];
    let mut left = [0_f32; 512];
    let mut right = [0_f32; 512];
    let inputs = [input.as_ptr(), input.as_ptr()];
    let outputs = [left.as_mut_ptr(), right.as_mut_ptr()];
    let mut produced = [zoeydaw_plugin_abi::NativeMidi::default(); 8192];
    let mut result = Ok(());
    for index in 0..12 {
        std::thread::sleep(Duration::from_millis(15));
        let mut block = NativeBlock {
            inputs: inputs.as_ptr(),
            outputs: outputs.as_ptr(),
            midi: std::ptr::null(),
            automation: std::ptr::null(),
            produced: produced.as_mut_ptr(),
            transport: std::ptr::null(),
            frames: 512,
            input_channels: 2,
            output_channels: 2,
            midi_count: 0,
            automation_count: 0,
            produced_capacity: 8192,
            produced_count: 0,
        };
        let status = callback(|| unsafe { (audio.process)(audio.context, &mut block) });
        if status < 0
            || (index > 7
                && left
                    .iter()
                    .chain(&right)
                    .any(|value| (*value - 0.125).abs() > 1e-6))
        {
            result = Err(format!(
                "Control-worker plugin output failed at block {index}: {status}, latency {latency}"
            ));
            break;
        }
    }
    unsafe { (audio.release)(audio.context) };
    result?;
    if monitor.wait_for_exit(Duration::from_secs(5)).is_none() {
        return Err("Helper survived last audio/control owner".into());
    }
    let restored = PreparedDevice::prepare(catalog.select(id)?, 48_000.0, 512, Some(state))?;
    if !restored
        .control
        .parameters()?
        .iter()
        .any(|(info, value)| info.id == 0 && (*value - 0.25).abs() < 1e-6)
    {
        return Err("Worker restore lost parameter state".into());
    }
    let monitor = restored.monitor.clone();
    drop(restored);
    if monitor.wait_for_exit(Duration::from_secs(5)).is_none() {
        return Err("Unadmitted prepared helper leaked".into());
    }
    println!(
        "Control worker: real parameter/state output, callback allocation guard and graph-retained helper lifetime passed"
    );
    Ok(())
}
