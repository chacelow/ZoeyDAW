use std::{path::PathBuf, time::{Duration, Instant}};
use zoeydaw_plugin_host::{PluginCatalog, device_session::{ParameterEvent, PreparedDevice}, scan_operation::ScanOperations, state_store::PluginStateStore};

fn gain(control: &zoeydaw_plugin_host::device_session::DeviceControl) -> Result<f64,String> {
    control.parameters()?.into_iter().find(|(info,_)|info.id==0).map(|(_,value)|value).ok_or("Missing gain parameter".into())
}

fn main() -> Result<(),String> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len()!=3 { return Err("Usage: editor_smoke HELPER FIXTURE_DIRECTORY NEW_CACHE_PATH".into()); }
    let cache = PathBuf::from(&args[2]);
    if cache.exists() { return Err("Smoke cache already exists".into()); }
    let mut catalog = PluginCatalog::new(PathBuf::from(&args[0]),cache.clone())?;
    let operations = ScanOperations::default();
    operations.reserve("editor-smoke".into(),"scan".into())?;
    let lease = operations.begin("editor-smoke".into(),"scan".into())?;
    let report = catalog.scan(&[PathBuf::from(&args[1])],&[],&lease,&|_| {})?;
    if report.cancelled || !report.issues.is_empty() { return Err(format!("Editor fixture scan failed: {:?}",report.issues)); }
    let entry = report.entries.iter().find(|entry|entry.plugin.class_id=="com.studio.plughost.test-delay.7900000b")
        .ok_or("Missing CLAP editor fixture")?;
    let prepared = PreparedDevice::prepare(catalog.select(&entry.catalog_id)?,48_000.0,512,None)?;
    let control = prepared.control;
    let audio = unsafe { prepared.audio.into_owned() };
    struct Release(zoeydaw_plugin_abi::OwnedNativeProcessor);
    impl Drop for Release { fn drop(&mut self) { unsafe { (self.0.release)(self.0.context) }; } }
    let _release = Release(audio);
    control.begin_editor(control.instance_id(),vec![(0,0.25)])?;
    if !control.editor_open()? || (gain(&control)?-0.25).abs()>1e-9 { return Err("Editor did not open with authored gain".into()); }
    control.set_parameter(0,0.6)?;
    let input=[0.5_f32;512];let mut left=[0_f32;512];let mut right=[0_f32;512];
    let inputs=[input.as_ptr(),input.as_ptr()];let outputs=[left.as_mut_ptr(),right.as_mut_ptr()];
    let mut produced=[zoeydaw_plugin_abi::NativeMidi::default();8192];
    let deadline = Instant::now()+Duration::from_secs(3);
    loop {
        let mut block=zoeydaw_plugin_abi::NativeBlock {
            inputs:inputs.as_ptr(),outputs:outputs.as_ptr(),midi:std::ptr::null(),automation:std::ptr::null(),
            produced:produced.as_mut_ptr(),transport:std::ptr::null(),frames:512,input_channels:2,output_channels:2,
            midi_count:0,automation_count:0,produced_capacity:8192,produced_count:0,
        };
        let status=unsafe { (_release.0.process)(_release.0.context,&mut block) };
        if status<0 { return Err(format!("Editor audio quantum failed: {status}")); }
        let (open,batch) = control.editor_events(control.instance_id())?;
        if !open { return Err("Editor closed during parameter feedback".into()); }
        if batch.events.windows(3).any(|events|matches!(&events[0],ParameterEvent::BeginEdit { id:0 })
            && matches!(&events[1],ParameterEvent::Value { id:0,normalized } if (*normalized-0.6).abs()<1e-9)
            && matches!(&events[2],ParameterEvent::EndEdit { id:0 })) { break; }
        if Instant::now()>=deadline { return Err(format!("Native parameter events did not reach the control worker: {:?}",batch)); }
        std::thread::sleep(Duration::from_millis(20));
    }
    let committed = control.end_editor(control.instance_id(),true)?;
    if control.editor_open()? { return Err("Editor remained open after commit".into()); }
    let store = PluginStateStore::new(cache.with_extension("states"))?;
    let reference = store.save(&committed)?;
    let restored = store.load(&reference,committed.format,&committed.class_id)?;
    let restored_device = PreparedDevice::prepare(catalog.select(&entry.catalog_id)?,48_000.0,512,Some(restored))?;
    if (gain(&restored_device.control)?-0.6).abs()>1e-9 { return Err("Edited chunk did not restore the actual gain".into()); }
    if control.instance_id()==restored_device.control.instance_id() { return Err("Replacement reused plugin instance identity".into()); }
    if PluginStateStore::new(cache.clone()).is_ok() { return Err("State store accepted a catalog file as its directory".into()); }
    control.end_editor(control.instance_id(),false)?;
    if (gain(&control)?-0.25).abs()>1e-9 { return Err("Failed state persistence lost the opening checkpoint".into()); }
    control.begin_editor(control.instance_id(),vec![(0,0.6)])?;
    control.set_parameter(0,0.9)?;
    control.end_editor(control.instance_id(),false)?;
    if (gain(&control)?-0.6).abs()>1e-9 || control.editor_open()? { return Err("Cancel failed to restore the full editor checkpoint".into()); }
    let previous=control.instance_id();
    let state=store.load(&reference,committed.format,&committed.class_id)?;
    let recovered=control.recover(previous,Some(state),vec![(0,0.6)])?;
    control.begin_editor(recovered.instance_id,vec![(0,0.6)])?;
    control.set_parameter(0,0.9)?;
    if control.end_editor(previous,false).is_ok() || control.release_editor(previous).is_ok() {
        return Err("Stale editor cleanup reached the recovered helper".into());
    }
    if !control.editor_open()? || (gain(&control)?-0.9).abs()>1e-9 { return Err("Stale cleanup closed or rolled back the newer editor".into()); }
    control.end_editor(recovered.instance_id,false)?;
    println!("Native editor open, ordered gesture/value feedback, edited state reload, instance replacement and cancel rollback passed");
    Ok(())
}
