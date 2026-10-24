use plughost::{
    BlockContext, Chain, HostIdentity, Layout, PluginFormat, PluginRef, RealtimeConfig, Timeouts,
    Transport,
};
use std::{path::PathBuf, time::Duration};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if !(2..=3).contains(&args.len()) {
        return Err("Usage: transport_smoke HELPER FIXTURE_DIRECTORY [INCOMPATIBLE_HELPER]".into());
    }
    let helper = PathBuf::from(&args[0]);
    for (format, extension, class_id, parameter) in [
        (
            PluginFormat::Clap,
            "clap",
            "com.studio.plughost.test-delay.79000001",
            7,
        ),
        (
            PluginFormat::Vst3,
            "vst3",
            "706C7567686F737444656C6179000001",
            4,
        ),
    ] {
        let plugin = PluginRef {
            format,
            bundle: Some(PathBuf::from(&args[1]).join(format!("plughost-test-delay.{extension}"))),
            class_id: class_id.into(),
        };
        if let Some(incompatible) = args.get(2) {
            match Chain::spawn(
                &PathBuf::from(incompatible),
                std::slice::from_ref(&plugin),
                &HostIdentity::default(),
                Timeouts::default(),
            ) {
                Ok(_) => return Err("Incompatible helper was accepted".into()),
                Err(error) => println!("{format:?}: incompatible helper rejected: {error}"),
            }
        }
        let spawn = || -> Result<Chain, plughost::Error> {
            let mut chain = Chain::spawn(
                &helper,
                std::slice::from_ref(&plugin),
                &HostIdentity::default(),
                Timeouts::default(),
            )?;
            let config = chain.main_bus_config(48_000.0, 512, Layout::Stereo, &[Layout::Stereo])?;
            chain.prepare_audio(&config)?;
            chain.set_parameter(0, parameter, 1.0)?;
            Ok(chain)
        };
        let mut actual = spawn()?;
        let mut reference = spawn()?;
        let endpoint = actual.realtime_endpoint(&RealtimeConfig::new(512))?;
        actual.start_realtime()?;
        let mut endpoint =
            zoeydaw_plugin_host::quantum::QuantumAudio::new(endpoint, 512, 2, 2, 48_000.0)?;
        let mut expected = Vec::new();
        let mut observed = Vec::new();
        let mut events = Vec::with_capacity(4096);
        let silence = [0.0_f32; 512];
        let mut left = [0.0_f32; 512];
        let mut right = [0.0_f32; 512];
        for block in 0..12 {
            let start = Transport::new(block * 512, true);
            let mut wrapped = Transport::new(-137, true);
            wrapped.tempo = Some(90.0);
            wrapped.beat_position = Some(1.103);
            wrapped.bar_position = Some(plughost::BarPosition {
                start: 0.0,
                number: 0,
            });
            wrapped.time_signature = Some(plughost::TimeSignature {
                numerator: 4,
                denominator: 4,
            });
            std::thread::sleep(Duration::from_millis(15));
            for (begin, end, transport) in if block == 4 {
                vec![(0, 173, start), (173, 512, wrapped)]
            } else {
                vec![(0, 512, start)]
            } {
                events.clear();
                endpoint.process(
                    &[&silence[begin..end], &silence[begin..end]],
                    &mut [&mut left[begin..end], &mut right[begin..end]],
                    end - begin,
                    &[],
                    &[],
                    &mut events,
                    Some(transport),
                )?;
            }
            observed.extend_from_slice(&left);
            for (begin, end, transport) in if block == 4 {
                vec![(0, 173, start), (173, 512, wrapped)]
            } else {
                vec![(0, 512, start)]
            } {
                reference.process_audio_f32(
                    &BlockContext::new(end - begin).with_transport(transport),
                    &[&silence[begin..end], &silence[begin..end]],
                    &mut [&mut left[begin..end], &mut right[begin..end]],
                    &[],
                    &[],
                    &mut events,
                )?;
            }
            expected.extend_from_slice(&left);
        }
        for index in 1024..observed.len() {
            if (observed[index] - expected[index - 1024]).abs() > 2e-5 {
                return Err(format!("{format:?} timeline differs at {index}").into());
            }
        }
        if !expected.iter().any(|sample| sample.abs() > 1e-4) {
            return Err("Transport probe produced no signal".into());
        }
        let callbacks_before = actual.realtime_status().unwrap().callbacks;
        for index in 0..=plughost::MAX_TRANSPORT_SEGMENTS {
            events.clear();
            endpoint.process(
                &[&silence[..1], &silence[..1]],
                &mut [&mut left[..1], &mut right[..1]],
                1,
                &[],
                &[],
                &mut events,
                Some(Transport::new(index as i64 * 100, true)),
            )?;
        }
        let rejected = endpoint.process(
            &[&silence[..1], &silence[..1]],
            &mut [&mut left[..1], &mut right[..1]],
            1,
            &[],
            &[],
            &mut events,
            Some(Transport::new(-100, true)),
        );
        if !matches!(
            rejected,
            Err(zoeydaw_plugin_host::quantum::QuantumError::Transport)
        ) {
            return Err("Excess transport changes advanced the quantum".into());
        }
        let remaining = 512 - plughost::MAX_TRANSPORT_SEGMENTS - 1;
        endpoint.process(
            &[&silence[..remaining], &silence[..remaining]],
            &mut [&mut left[..remaining], &mut right[..remaining]],
            remaining,
            &[],
            &[],
            &mut events,
            Some(Transport::new(
                plughost::MAX_TRANSPORT_SEGMENTS as i64 * 100 + 1,
                true,
            )),
        )?;
        if actual.realtime_status().unwrap().callbacks != callbacks_before + 1 {
            return Err("Rejected transport change corrupted quantum progress".into());
        }
        actual.stop_realtime()?;
        println!(
            "{format:?}: one quantum with an internal timeline jump matches separate native processing blocks"
        );
    }
    Ok(())
}
