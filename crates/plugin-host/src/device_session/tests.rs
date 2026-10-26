use super::*;
use std::{path::PathBuf, time::Duration};

#[path="../../../../third_party/plughost/crates/plughost/tests/support/stall.rs"]
mod stall;

struct Audio {
    owned: OwnedNativeProcessor,
    input: [f32;512],
    left: [f32;512],
    right: [f32;512],
    midi: [zoeydaw_plugin_abi::NativeMidi;8192],
}
impl Audio {
    fn new(audio: DeviceAudio) -> Self {
        Self { owned:unsafe { audio.into_owned() },input:[0.5;512],left:[0.0;512],right:[0.0;512],midi:[zoeydaw_plugin_abi::NativeMidi::default();8192] }
    }
    fn process(&mut self) {
        let inputs=[self.input.as_ptr(),self.input.as_ptr()];
        let outputs=[self.left.as_mut_ptr(),self.right.as_mut_ptr()];
        let mut block=NativeBlock { inputs:inputs.as_ptr(),outputs:outputs.as_ptr(),midi:std::ptr::null(),automation:std::ptr::null(),
            produced:self.midi.as_mut_ptr(),transport:std::ptr::null(),frames:512,input_channels:2,output_channels:2,
            midi_count:0,automation_count:0,produced_capacity:8192,produced_count:0 };
        assert!(unsafe { (self.owned.process)(self.owned.context,&mut block) }>=0,"Plugin callback rejected a valid block");
        thread::sleep(Duration::from_millis(15));
    }
    fn expect(&self, value: f32) {
        assert!(self.left.iter().chain(&self.right).all(|sample|(*sample-value).abs()<1e-6),"Recovered PCM differs from authored gain");
    }
}
impl Drop for Audio {
    fn drop(&mut self) { unsafe { (self.owned.release)(self.owned.context) }; }
}

#[test]
#[ignore="requires the bundled helper and locally built plugin fixtures"]
fn hung_device_recovers_same_callback_from_checkpoint_before_replaying_authored_parameters() {
    let helper=PathBuf::from(std::env::var_os("ZOEYDAW_TEST_PLUGIN_HELPER").expect("Missing helper path"));
    let directory=PathBuf::from(std::env::var_os("ZOEYDAW_TEST_PLUGIN_FIXTURES").expect("Missing fixture directory"));
    let mut barrier=stall::Stall::new();
    let selection=|variant: &str,class: &str,host| PluginSelection {
        helper:helper.clone(),host,
        reference:plughost::PluginRef { format:plughost::PluginFormat::Clap,bundle:Some(directory.join(format!("plughost-test-{variant}.clap"))),class_id:class.into() },
    };
    let device=PreparedDevice::prepare(selection("stall-in-process","com.studio.plughost.test-delay.79000018",barrier.identity()),48_000.0,512,None).unwrap();
    let healthy=PreparedDevice::prepare(selection("delay","com.studio.plughost.test-delay.79000001",plughost::HostIdentity::default()),48_000.0,512,None).unwrap();
    let control=device.control;
    control.set_parameter(0,0.25).unwrap();
    let checkpoint=control.snapshot().unwrap();
    let original=control.health().unwrap();
    assert!(original.fault.is_none());
    let mut audio=Audio::new(device.audio);
    let mut independent=Audio::new(healthy.audio);
    for _ in 0..10 { audio.process();independent.process(); }
    barrier.wait_until_entered();
    thread::sleep(Duration::from_millis(2100));
    let fault=control.health().unwrap();
    assert!(matches!(fault.fault.as_ref().map(|fault|&fault.kind),Some(DeviceFaultKind::Hang)));
    independent.expect(0.5);
    assert!(control.recover(original.instance_id,Some(checkpoint.clone()),vec![(u64::MAX,0.75)]).is_err());
    assert_eq!(control.instance_id(),original.instance_id,"Rejected candidate advanced instance identity");
    assert_eq!(control.health().unwrap().helper_process_id,original.helper_process_id);
    let recovered=control.recover(original.instance_id,Some(checkpoint),vec![(0,0.75)]).unwrap();
    assert_ne!(recovered.instance_id,original.instance_id);
    assert_ne!(recovered.helper_process_id,original.helper_process_id);
    assert!(recovered.fault.is_none());
    assert!(control.recover(original.instance_id,None,vec![]).is_err(),"Stale recovery targeted the new helper");
    for index in 0..7 {
        audio.process();independent.process();
        if index>=4 { audio.expect(0.375); }
        independent.expect(0.5);
    }
    drop(barrier);
}
