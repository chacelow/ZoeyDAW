use std::{collections::VecDeque, ffi::c_void, future::Future, pin::Pin, sync::{Arc, Mutex, atomic::{AtomicUsize, Ordering}}, task::{Context, Poll, Wake, Waker}};
use serde_json::json;
use zoeydaw_engine::{MainThreadDispatcher, PlaybackService, PluginAdmissionRequest};
use zoeydaw_plugin_abi::{NativeBlock, OwnedNativeProcessor, PendingProcessor, PreparedFormat, PreparedPlugin};

#[derive(Default)]
struct MainQueue(Mutex<VecDeque<Box<dyn FnOnce() + Send>>>);
impl MainThreadDispatcher for MainQueue {
    fn dispatch(&self, action: impl FnOnce() + Send + 'static) -> Result<(), String> {
        self.0.lock().unwrap().push_back(Box::new(action));
        Ok(())
    }
}
impl MainQueue {
    fn run(&self) { let action = self.0.lock().unwrap().pop_front().expect("queued main action"); action(); }
}
struct NoopWake;
impl Wake for NoopWake { fn wake(self: Arc<Self>) {} }
fn poll<F: Future>(future: Pin<&mut F>) -> Poll<F::Output> {
    future.poll(&mut Context::from_waker(&Waker::from(Arc::new(NoopWake))))
}
fn request(released: &Arc<AtomicUsize>) -> PluginAdmissionRequest {
    unsafe extern "C" fn process(_: *mut c_void, _: *mut NativeBlock) -> i32 { 0 }
    unsafe extern "C" fn release(context: *mut c_void) {
        let count = unsafe { Box::from_raw(context.cast::<Arc<AtomicUsize>>()) };
        count.fetch_add(1, Ordering::SeqCst);
    }
    PluginAdmissionRequest {
        lease_id: "admission-smoke".into(), session_id: "admission-smoke".into(), device_id: "device".into(), revision: 0,
        format: PreparedFormat { sample_rate: 48000.0, quantum: 512, input_channels: 2, output_channels: 2, latency_frames: 1024 },
        processor: unsafe { PendingProcessor::new(OwnedNativeProcessor {
            context: Box::into_raw(Box::new(released.clone())).cast(), process, release,
        }) },
    }
}
fn main() -> Result<(), String> {
    let service = PlaybackService::default();
    let queue = MainQueue::default();
    service.acquire("admission-smoke".into(), "admission-smoke".into())?;
    let document = json!({"protocolVersion":2,"sessionId":"admission-smoke","sequence":0,"baseRevision":0,"revision":0,"stage":"open","editId":null,"controlGeneration":"0","state":{"project":{"bpm":120,"numerator":4,"denominator":4,"loop":{"enabled":false,"startBar":1,"endBar":5},"sources":[],"tracks":[{"id":"main","kind":"main","output":"external","input":"none","inputChannel":null,"outputChannel":"1-2","monitor":"off","volumeDb":0,"pan":0,"mute":false,"solo":false,"armed":false,"sends":{},"returnPost":false,"cueOutput":null,"cueVolumeDb":-18,"devices":[],"clips":[],"automation":[],"childTrackIds":[]}]},"control":{"playing":false,"recording":false,"seekBar":1,"seekGeneration":0}}});
    let mut open = Box::pin(service.apply(&queue, document.clone(), "admission-smoke".into(), 0));
    assert!(poll(open.as_mut()).is_pending()); queue.run();
    let Poll::Ready(receipt) = poll(open.as_mut()) else { return Err("Open did not finish".into()); };
    assert_eq!(receipt?["kind"], "accepted");
    let released = Arc::new(AtomicUsize::new(0));
    let mut admission = Box::pin(service.admit_plugin(&queue, request(&released)));
    assert!(poll(admission.as_mut()).is_pending()); queue.run();
    assert_eq!(released.load(Ordering::SeqCst), 0);
    drop(admission); queue.run();
    assert_eq!(released.load(Ordering::SeqCst), 1);
    let mut admission = Box::pin(service.admit_plugin(&queue, request(&released)));
    assert!(poll(admission.as_mut()).is_pending()); queue.run();
    let Poll::Ready(token) = poll(admission.as_mut()) else { return Err("Admission did not finish".into()); };
    let token = token?;
    drop(admission);
    assert_eq!(released.load(Ordering::SeqCst), 1);
    let mut cancel = Box::pin(service.cancel_plugin(&queue, "admission-smoke".into(), "admission-smoke".into(), token));
    assert!(poll(cancel.as_mut()).is_pending()); queue.run();
    assert_eq!(poll(cancel.as_mut()), Poll::Ready(Ok(())));
    assert_eq!(released.load(Ordering::SeqCst), 2);
    for malformed in [true, false] {
        let mut next = document.clone();
        next["stage"] = json!("commit"); next["sequence"] = json!(1); next["revision"] = json!(1);
        if malformed { next["unexpected"] = json!(true); }
        let source = request(&released);
        let prepared = PreparedPlugin { device_id: source.device_id, format: source.format, processor: source.processor };
        let mut apply = Box::pin(service.apply_prepared(&queue, next, "admission-smoke".into(), 0, vec![prepared]));
        assert!(poll(apply.as_mut()).is_pending()); queue.run();
        let Poll::Ready(result) = poll(apply.as_mut()) else { return Err("Rejected apply did not finish".into()); };
        assert!(result.is_err());
    }
    assert_eq!(released.load(Ordering::SeqCst), 4);
    for malformed in [true,false] {
        let source=request(&released);
        let prepared=PreparedPlugin { device_id:source.device_id,format:source.format,processor:source.processor };
        let mut payload=json!({"request":{},"plan":{},"leaseId":"admission-smoke","sessionId":"admission-smoke"});
        if malformed { payload.as_object_mut().unwrap().remove("request"); }
        let mut configuration=Box::pin(service.configure_device_prepared(&queue,payload,vec![prepared]));
        assert!(poll(configuration.as_mut()).is_pending());queue.run();
        let Poll::Ready(result)=poll(configuration.as_mut()) else { return Err("Rejected configuration did not finish".into()); };
        assert!(result.is_err());
    }
    assert_eq!(released.load(Ordering::SeqCst),6);
    let mut stopped = Box::pin(service.stop(&queue, "admission-smoke".into(), "admission-smoke".into(), 1));
    assert!(poll(stopped.as_mut()).is_pending()); queue.run();
    assert_eq!(poll(stopped.as_mut()), Poll::Ready(Ok(())));
    let source = request(&released);
    let prepared = PreparedPlugin { device_id: source.device_id, format: source.format, processor: source.processor };
    let mut next = document.clone(); next["stage"] = json!("commit"); next["sequence"] = json!(1); next["revision"] = json!(1);
    let mut stale = Box::pin(service.apply_prepared(&queue, next, "admission-smoke".into(), 0, vec![prepared]));
    assert!(poll(stale.as_mut()).is_pending()); queue.run();
    let Poll::Ready(result) = poll(stale.as_mut()) else { return Err("Stopped apply did not finish".into()); };
    assert_eq!(result?["kind"], "rejected");
    assert_eq!(released.load(Ordering::SeqCst), 7);
    let source=request(&released);
    let prepared=PreparedPlugin { device_id:source.device_id,format:source.format,processor:source.processor };
    let payload=json!({"request":{},"plan":{},"leaseId":"admission-smoke","sessionId":"admission-smoke"});
    let mut configuration=Box::pin(service.configure_device_prepared(&queue,payload,vec![prepared]));
    assert!(poll(configuration.as_mut()).is_pending());
    let mut close = Box::pin(service.release(&queue, "admission-smoke".into()));
    assert!(poll(close.as_mut()).is_pending());queue.run();
    let Poll::Ready(result)=poll(configuration.as_mut()) else { return Err("Released configuration did not finish".into()); };
    assert!(result.is_err_and(|error|error.contains("lease was released")));
    assert_eq!(released.load(Ordering::SeqCst),8);
    queue.run();assert_eq!(poll(close.as_mut()), Poll::Ready(Ok(())));
    assert!(queue.0.lock().unwrap().is_empty());
    println!("Real EngineSession: cancelled admission receipts, invalid prepared apply/configuration batches, Stop and released owners release processors exactly once");
    Ok(())
}
