use super::*;
use super::super::{PluginFaultReport, metadata_generated::{PluginFaultKind, PositiveF64}, meter_hub::HubTransport, native_reader::{NativeMeterGraph,NativeMeterRegistry}};

fn snapshot() -> HubSnapshot {
    HubSnapshot {
        sequence:1,produced_monotonic_ns:1,
        registry:Arc::new(NativeMeterRegistry {
            session_id:"session".into(),device_epoch:1,generation:1,registry_revision:1,
            graph:NativeMeterGraph::Prepared { sample_rate:PositiveF64::new(48_000.0).unwrap() },
            entries:vec![],sources:vec![],input:None,
        }),records:vec![],sources:vec![],reset_epoch:1,endpoint_resets:Arc::new(vec![]),transport:HubTransport::Unavailable,input:None,
    }
}
fn report(id: &str) -> PluginFaultReport {
    PluginFaultReport { session_id:"session".into(),track_id:"voice".into(),device_id:"external".into(),fault_id:id.into(),
        fault:PluginFaultKind::Hang,code:"plugin-hang".into(),message:"Blocked helper".into(),recoverable:true }
}
fn overflow(streams: &mut MeterStreams) {
    let registry=streams.registry.as_ref().unwrap();
    for _ in 0..4100 {
        streams.events.append(event_context(registry),RealtimeEventPayload::Xrun { count:JsonU64(1),device_sample:JsonU64(512) }).unwrap();
    }
}
fn sequence(event: &RealtimeEvent) -> u64 {
    match event {
        RealtimeEvent::PluginFault { seq,.. } | RealtimeEvent::EventGap { seq,.. } | RealtimeEvent::Xrun { seq,.. } => seq.0,
        _ => panic!("Unexpected stream event"),
    }
}

#[test]
fn plugin_fault_incidents_keep_owned_delivery_and_current_gap_state() {
    let mut streams=MeterStreams::default();
    let admission=streams.reserve("main","lease","session").unwrap();
    let opened=streams.finish(admission,&snapshot()).unwrap();
    streams.bind_events("main",opened.stream_id,Arc::new(|_|Ok(()))).unwrap();
    assert!(streams.update_plugin_faults("main","lease",vec![report("external:1:hang")]).unwrap());
    let first=streams.event_deliveries().unwrap();
    assert!(matches!(&first[0].3[0],RealtimeEvent::PluginFault { fault_id,device_id,track_id,recoverable:true,.. }
        if fault_id=="external:1:hang" && device_id=="external" && track_id=="voice"));
    streams.receipt("main",opened.stream_id,sequence(first[0].3.last().unwrap())).unwrap();
    for _ in 0..3 {
        streams.update_plugin_faults("main","lease",vec![report("external:1:hang")]).unwrap();
        assert!(streams.event_deliveries().unwrap().is_empty(),"Repeated polling duplicated the incident");
    }
    assert!(!streams.update_plugin_faults("other","lease",vec![report("foreign")]).unwrap());
    let mut foreign=report("foreign");foreign.session_id="other-session".into();
    assert!(streams.update_plugin_faults("main","lease",vec![foreign]).is_err());
    overflow(&mut streams);
    let gap=streams.event_deliveries().unwrap();
    assert!(matches!(&gap[0].3[0],RealtimeEvent::EventGap { counters,latched_faults,.. }
        if counters.plugin_faults.0==1 && latched_faults.len()==1 && latched_faults[0].fault_id=="external:1:hang"
            && latched_faults[0].owner_id.as_deref()==Some("external")));
    streams.receipt("main",opened.stream_id,sequence(gap[0].3.last().unwrap())).unwrap();
    streams.update_plugin_faults("main","lease",vec![report("external:2:hang")]).unwrap();
    streams.update_plugin_faults("main","lease",vec![]).unwrap();
    overflow(&mut streams);
    let recovered=streams.event_deliveries().unwrap();
    assert!(matches!(&recovered[0].3[0],RealtimeEvent::EventGap { counters,latched_faults,.. }
        if counters.plugin_faults.0==2 && latched_faults.is_empty()),"Recovered devices remained latched or incident counts reset");
    streams.close_window("main");
    assert!(!streams.update_plugin_faults("main","lease",vec![report("closed")]).unwrap());
}
