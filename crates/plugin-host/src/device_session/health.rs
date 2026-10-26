use super::{NativeContext, NEXT_INSTANCE};
use plughost::{Chain, PluginState};
use serde::Serialize;
use std::sync::{Arc, atomic::{AtomicU64, Ordering}};
use std::time::Duration;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all="kebab-case")]
pub enum DeviceFaultKind { Crash, Hang, ResyncRequired, ProcessingFailed }

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct DeviceFault {
    pub kind: DeviceFaultKind,
    pub code: String,
    pub message: String,
    pub recoverable: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct DeviceHealth {
    #[serde(serialize_with="serialize_instance")]
    pub instance_id: u64,
    pub helper_process_id: u32,
    pub fault: Option<DeviceFault>,
}
fn serialize_instance<S: serde::Serializer>(value: &u64, serializer: S) -> Result<S::Ok,S::Error> {
    serializer.serialize_str(&value.to_string())
}

pub(super) struct DeviceRecovery {
    pub instance: Arc<AtomicU64>,
    pub context: Arc<NativeContext>,
    pub latency: u32,
}
impl DeviceRecovery {
    pub fn require_instance(&self, expected: u64) -> Result<(),String> {
        if self.instance.load(Ordering::Acquire)!=expected { return Err("Stale plugin instance".into()); }
        Ok(())
    }
    pub fn health(&self, chain: &Chain) -> DeviceHealth {
        let monitor=chain.helper_monitor();
        let callback=self.context.status.load(Ordering::Acquire);
        let fault=if callback<0 {
            Some(DeviceFault { kind:DeviceFaultKind::ProcessingFailed,code:format!("native-callback-{callback}"),
                message:format!("Native plugin callback rejected a block ({callback}); reprepare is required"),recoverable:false })
        } else if let Some(status)=monitor.exit_status() {
            Some(DeviceFault { kind:DeviceFaultKind::Crash,code:"plugin-crash".into(),
                message:format!("Plugin helper exited ({status})"),recoverable:true })
        } else if let Some(status)=chain.realtime_status() {
            if status.stalled>=Duration::from_secs(2) {
                Some(DeviceFault { kind:DeviceFaultKind::Hang,code:"plugin-hang".into(),
                    message:"Plugin helper has not completed pending audio for at least two seconds".into(),recoverable:true })
            } else if status.resync {
                Some(DeviceFault { kind:DeviceFaultKind::ResyncRequired,
                    code:"plugin-resync-required".into(),message:"Plugin audio endpoint requires explicit recovery".into(),recoverable:true })
            } else { None }
        } else {
            Some(DeviceFault { kind:DeviceFaultKind::ProcessingFailed,code:"plugin-not-prepared".into(),
                message:"Plugin audio endpoint is not prepared".into(),recoverable:false })
        };
        DeviceHealth { instance_id:self.instance.load(Ordering::Acquire),helper_process_id:monitor.process_id(),fault }
    }
    pub fn recover(&self, chain: &mut Chain, expected: u64, state: Option<PluginState>, parameters: Vec<(u64,f64)>) -> Result<DeviceHealth,String> {
        self.require_instance(expected)?;
        if self.context.status.load(Ordering::Acquire)<0 { return Err("A native callback contract fault requires reprepare".into()); }
        let states:Vec<_>=state.into_iter().collect();
        let recovered=chain.recover_realtime_configured(&states,|candidate| {
            for (id,value) in parameters { candidate.set_parameter(0,id,value)?; }
            if candidate.latency()!=self.latency {
                return Err(plughost::Error::Render(plughost::RenderError::LatencyChanged { before:self.latency,after:candidate.latency() }));
            }
            Ok(())
        }).map_err(|error|error.to_string())?;
        *chain=recovered;
        self.context.status.store(0,Ordering::Release);
        self.instance.store(NEXT_INSTANCE.fetch_add(1,Ordering::Relaxed),Ordering::Release);
        Ok(self.health(chain))
    }
}
