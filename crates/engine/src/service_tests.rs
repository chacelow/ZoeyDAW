use super::*;
    use std::collections::VecDeque;
    use std::future::Future;
    use std::pin::Pin;
    use std::task::{Context, Poll, Wake, Waker};

    #[derive(Default)]
    struct QueuedDispatcher(Mutex<VecDeque<Box<dyn FnOnce() + Send>>>);

    impl MainThreadDispatcher for QueuedDispatcher {
        fn dispatch(&self, action: impl FnOnce() + Send + 'static) -> Result<(), String> {
            self.0.lock().unwrap().push_back(Box::new(action));
            Ok(())
        }
    }

    impl QueuedDispatcher {
        fn run_next(&self) {
            let action = self.0.lock().unwrap().pop_front().unwrap();
            action();
        }
    }

    struct NoopWake;
    impl Wake for NoopWake {
        fn wake(self: Arc<Self>) {}
    }

    fn poll<F: Future>(future: Pin<&mut F>) -> Poll<F::Output> {
        let waker = Waker::from(Arc::new(NoopWake));
        future.poll(&mut Context::from_waker(&waker))
    }

    #[test]
    fn queued_apply_rechecks_released_lease_before_creating_session() {
        let service = PlaybackService::default();
        let main = QueuedDispatcher::default();
        service.acquire("lease".into(), "old".into()).unwrap();
        let mut apply = std::pin::pin!(service.apply(&main, json!({"sessionId": "old"}), "lease".into(), 0));
        assert!(poll(apply.as_mut()).is_pending());
        let mut release = std::pin::pin!(service.release(&main, "lease".into()));
        assert!(poll(release.as_mut()).is_pending());
        main.run_next();
        assert_eq!(poll(apply.as_mut()), Poll::Ready(Err("Playback lease was released".into())));
        assert_eq!(service.owner.handle.load(Ordering::Acquire), 0);
        // The release remains queued; dropping it must not create a session either.
        main.0.lock().unwrap().clear();
        assert_eq!(poll(release.as_mut()), Poll::Ready(Err("Main-thread playback operation was cancelled".into())));
    }

    #[test]
    fn queued_audition_rechecks_generation_before_creating_session() {
        let service = PlaybackService::default();
        let main = QueuedDispatcher::default();
        let generation = service.reserve_audition().unwrap();
        let mut audition = std::pin::pin!(service.audition(&main, json!({"generation": generation})));
        assert!(poll(audition.as_mut()).is_pending());
        assert!(service.reserve_audition().unwrap() > generation);
        main.run_next();
        assert_eq!(poll(audition.as_mut()), Poll::Ready(Err("Stale audition generation".into())));
        assert_eq!(service.owner.handle.load(Ordering::Acquire), 0);
    }

    struct FailedDispatcher;
    impl MainThreadDispatcher for FailedDispatcher {
        fn dispatch(&self, _action: impl FnOnce() + Send + 'static) -> Result<(), String> {
            Err("dispatch failed".into())
        }
    }

    struct DroppedDispatcher;
    impl MainThreadDispatcher for DroppedDispatcher {
        fn dispatch(&self, _action: impl FnOnce() + Send + 'static) -> Result<(), String> {
            Ok(())
        }
    }

    #[test]
    fn dispatch_failure_and_dropped_reply_propagate_without_creating_session() {
        let service = PlaybackService::default();
        let mut failed = std::pin::pin!(service.devices(&FailedDispatcher));
        assert_eq!(poll(failed.as_mut()), Poll::Ready(Err("dispatch failed".into())));
        let mut dropped = std::pin::pin!(service.devices(&DroppedDispatcher));
        assert_eq!(poll(dropped.as_mut()), Poll::Ready(Err("Main-thread playback operation was cancelled".into())));
        assert_eq!(service.owner.handle.load(Ordering::Acquire), 0);
    }

    fn plugin_request(released: &Arc<AtomicUsize>) -> crate::PluginAdmissionRequest {
        use zoeydaw_plugin_abi::{NativeBlock, OwnedNativeProcessor, PendingProcessor, PreparedFormat};
        unsafe extern "C" fn process(_: *mut c_void, _: *mut NativeBlock) -> i32 { 0 }
        unsafe extern "C" fn release(context: *mut c_void) {
            let count = unsafe { Box::from_raw(context.cast::<Arc<AtomicUsize>>()) };
            count.fetch_add(1, Ordering::SeqCst);
        }
        let processor = OwnedNativeProcessor { context: Box::into_raw(Box::new(released.clone())).cast(), process, release };
        crate::PluginAdmissionRequest {
            lease_id: "lease".into(), session_id: "session".into(), device_id: "device".into(), revision: 0,
            format: PreparedFormat { sample_rate: 48000.0, quantum: 512, input_channels: 2, output_channels: 2, latency_frames: 1024 },
            processor: unsafe { PendingProcessor::new(processor) },
        }
    }

    #[test]
    fn plugin_dispatch_failure_and_released_lease_drop_processor_once() {
        let service = PlaybackService::default();
        let released = Arc::new(AtomicUsize::new(0));
        let mut failed = std::pin::pin!(service.admit_plugin(&FailedDispatcher, plugin_request(&released)));
        assert_eq!(poll(failed.as_mut()), Poll::Ready(Err("dispatch failed".into())));
        assert_eq!(released.load(Ordering::SeqCst), 1);
        let mut dropped = std::pin::pin!(service.admit_plugin(&DroppedDispatcher, plugin_request(&released)));
        assert_eq!(poll(dropped.as_mut()), Poll::Ready(Err("Plugin admission dispatch was cancelled".into())));
        assert_eq!(released.load(Ordering::SeqCst), 2);
        let main = QueuedDispatcher::default();
        service.acquire("lease".into(), "session".into()).unwrap();
        let mut admission = std::pin::pin!(service.admit_plugin(&main, plugin_request(&released)));
        assert!(poll(admission.as_mut()).is_pending());
        let mut release = std::pin::pin!(service.release(&main, "lease".into()));
        assert!(poll(release.as_mut()).is_pending());
        main.run_next();
        assert_eq!(poll(admission.as_mut()), Poll::Ready(Err("Playback lease was released".into())));
        assert_eq!(released.load(Ordering::SeqCst), 3);
        assert_eq!(service.owner.handle.load(Ordering::Acquire), 0);
        main.0.lock().unwrap().clear();
    }

    #[test]
    fn dropping_plugin_admission_before_dispatch_releases_without_opening_engine() {
        let service = PlaybackService::default();
        service.acquire("lease".into(), "session".into()).unwrap();
        let main = QueuedDispatcher::default();
        let released = Arc::new(AtomicUsize::new(0));
        let mut admission = Box::pin(service.admit_plugin(&main, plugin_request(&released)));
        assert!(poll(admission.as_mut()).is_pending());
        drop(admission);
        main.run_next();
        assert_eq!(released.load(Ordering::SeqCst), 1);
        assert_eq!(service.owner.handle.load(Ordering::Acquire), 0);
    }

    #[test]
    fn reloaded_client_reserves_after_retained_native_generation() {
        let service = PlaybackService::default();
        service.owner.audition_generation.store(4096, Ordering::Release);
        let reloaded = service.clone();
        assert_eq!(reloaded.owner.reserve_audition().unwrap(), 4097);
        assert_eq!(service.owner.reserve_audition().unwrap(), 4098);
    }

    #[test]
    fn reservation_invalidates_old_and_unreserved_audition_operations() {
        let owner = Owner::default();
        assert!(!owner.is_current_audition(0));
        let old = owner.reserve_audition().unwrap();
        assert!(owner.is_current_audition(old));
        let replacement = owner.reserve_audition().unwrap();
        assert!(!owner.is_current_audition(old));
        assert!(owner.is_current_audition(replacement));
        assert!(!owner.is_current_audition(replacement + 1));
        assert_eq!(owner.audition_generation.load(Ordering::Acquire), replacement);
    }

    #[test]
    fn reservation_never_exceeds_javascript_safe_integer_or_wraps() {
        let owner = Owner::default();
        owner.audition_generation.store(MAX_SAFE_INTEGER - 1, Ordering::Release);
        assert_eq!(owner.reserve_audition().unwrap(), MAX_SAFE_INTEGER);
        assert!(owner.reserve_audition().is_err());
        assert_eq!(owner.audition_generation.load(Ordering::Acquire), MAX_SAFE_INTEGER);
    }

    #[test]
    fn concurrent_clients_receive_unique_monotone_native_generations() {
        let owner = Arc::new(Owner::default());
        let clients: Vec<_> = (0..4).map(|_| {
            let owner = owner.clone();
            std::thread::spawn(move || (0..32).map(|_| owner.reserve_audition().unwrap()).collect::<Vec<_>>())
        }).collect();
        let mut generations: Vec<_> = clients.into_iter().flat_map(|client| client.join().unwrap()).collect();
        generations.sort_unstable();
        assert_eq!(generations, (1..=128).collect::<Vec<_>>());
    }

    fn register_note_session(service: &PlaybackService, _main: &QueuedDispatcher, lease: &str, session: &str) -> Arc<NoteQueue> {
        service.acquire(lease.into(), session.into()).unwrap();
        service.owner.note_queue(lease, session).unwrap()
    }

    #[test]
    fn queued_control_and_note_recheck_released_lease_at_execution() {
        let service = PlaybackService::default();
        let main = QueuedDispatcher::default();
        let queue = register_note_session(&service, &main, "lease", "s");
        let request = json!({"protocolVersion": 2, "sessionId": "s", "sequence": 1, "controlGeneration": "1",
            "control": {"playing": true, "recording": false, "seekBar": 1, "seekGeneration": 0}});
        let mut control = std::pin::pin!(service.control(&main, request, "lease".into(), 0));
        let mut note = std::pin::pin!(service.note(&main, json!({"sessionId": "s", "sequence": 0}), "lease".into(), 0));
        assert!(poll(control.as_mut()).is_pending());
        assert!(poll(note.as_mut()).is_pending());
        service.owner.released_leases.lock().unwrap().insert("lease".into());
        main.run_next();
        main.run_next();
        assert_eq!(poll(control.as_mut()), Poll::Ready(Err("Playback lease was released".into())));
        assert_eq!(poll(note.as_mut()), Poll::Ready(Err("Playback lease was released".into())));
        assert_eq!(queue.pending.load(Ordering::Acquire), 0);
        assert_eq!(service.owner.handle.load(Ordering::Acquire), 0);
    }

    #[test]
    fn queued_open_and_control_recheck_stop_token_before_native_access() {
        let service = PlaybackService::default();
        let main = QueuedDispatcher::default();
        service.acquire("lease".into(), "s".into()).unwrap();
        let request = json!({"sessionId": "s", "sequence": 0, "controlGeneration": "1", "stage": "open"});
        let mut opening = std::pin::pin!(service.apply(&main, request.clone(), "lease".into(), 0));
        let mut control = std::pin::pin!(service.control(&main, request, "lease".into(), 0));
        assert!(poll(opening.as_mut()).is_pending());
        assert!(poll(control.as_mut()).is_pending());
        let mut stopping = std::pin::pin!(service.stop(&main, "lease".into(), "s".into(), 1));
        assert!(poll(stopping.as_mut()).is_pending());
        main.run_next();
        main.run_next();
        let rejected = json!({"kind":"rejected", "sessionId":"s", "sequence":0, "controlGeneration":"1", "code":"rejected"});
        assert_eq!(poll(opening.as_mut()), Poll::Ready(Ok(json!({"kind":"rejected", "sessionId":"s", "sequence":0, "controlGeneration":"1", "code":"superseded-open"}))));
        assert_eq!(poll(control.as_mut()), Poll::Ready(Ok(rejected)));
        assert_eq!(service.owner.handle.load(Ordering::Acquire), 0);
        main.0.lock().unwrap().clear();
        assert_eq!(poll(stopping.as_mut()), Poll::Ready(Err("Main-thread playback operation was cancelled".into())));
    }

    #[test]
    fn pending_stop_fences_are_scoped_to_lease_and_session() {
        let service = PlaybackService::default();
        let main = QueuedDispatcher::default();
        service.acquire("lease-a".into(), "s".into()).unwrap();
        let mut opening = Box::pin(service.apply(&main, json!({"sessionId": "s"}), "lease-a".into(), 0));
        assert!(poll(opening.as_mut()).is_pending());
        drop(opening);
        let mut stopping = std::pin::pin!(service.stop(&main, "lease-a".into(), "s".into(), 7));
        assert!(poll(stopping.as_mut()).is_pending());
        let tokens = service.owner.lease_stop_tokens.lock().unwrap();
        assert_eq!(tokens.get("lease-a").and_then(|sessions| sessions.get("s")).map(|state| state.stop_token), Some(7));
        assert!(tokens.get("lease-a").and_then(|sessions| sessions.get("other")).is_none());
        assert!(tokens.get("lease-b").is_none());
        assert_eq!(service.owner.handle.load(Ordering::Acquire), 0);
    }

    #[test]
    fn stop_epoch_overflow_does_not_wrap_or_dispatch() {
        let service = PlaybackService::default();
        let main = QueuedDispatcher::default();
        service.acquire("lease".into(), "s".into()).unwrap();
        let mut opening = Box::pin(service.apply(&main, json!({"sessionId": "s"}), "lease".into(), 0));
        assert!(poll(opening.as_mut()).is_pending());
        drop(opening);
        main.0.lock().unwrap().clear();
        service.owner.stop_epoch.store(MAX_SAFE_INTEGER, Ordering::Release);
        let mut stopping = std::pin::pin!(service.stop(&main, "lease".into(), "s".into(), 1));
        assert_eq!(poll(stopping.as_mut()), Poll::Ready(Err("Playback stop epoch limit reached".into())));
        assert_eq!(service.owner.stop_epoch.load(Ordering::Acquire), MAX_SAFE_INTEGER);
        assert!(main.0.lock().unwrap().is_empty());
    }

    #[test]
    fn note_queue_is_bounded_and_latches_one_native_panic_dispatch() {
        let service = PlaybackService::default();
        let main = QueuedDispatcher::default();
        let queue = register_note_session(&service, &main, "lease", "s");
        let mut notes: Vec<_> = (0..4096).map(|sequence| Box::pin(service.note(&main,
            json!({"sessionId": "s", "sequence": sequence}), "lease".into(), 0))).collect();
        for note in &mut notes { assert!(poll(note.as_mut()).is_pending()); }
        assert_eq!(queue.pending.load(Ordering::Acquire), 4096);
        let mut overflow = std::pin::pin!(service.note(&main, json!({"sessionId": "s", "sequence": 4096}), "lease".into(), 0));
        assert!(poll(overflow.as_mut()).is_pending());
        assert!(queue.overrun.load(Ordering::Acquire));
        let mut duplicate = std::pin::pin!(service.note(&main, json!({"sessionId": "s", "sequence": 4097}), "lease".into(), 0));
        assert_eq!(poll(duplicate.as_mut()), Poll::Ready(Ok(json!({"kind": "rejected", "sessionId": "s", "sequence": 4097, "code": "note-overrun"}))));
        assert_eq!(main.0.lock().unwrap().len(), 4097);
        main.0.lock().unwrap().clear();
        assert_eq!(queue.pending.load(Ordering::Acquire), 0);
        assert!(!queue.overrun.load(Ordering::Acquire));
        assert_eq!(poll(overflow.as_mut()), Poll::Ready(Err("Main-thread playback operation was cancelled".into())));
        assert_eq!(service.owner.handle.load(Ordering::Acquire), 0);
    }

    #[test]
    fn native_response_parser_rejects_malformed_json_and_propagates_failure() {
        assert!(parse_response("not-json").unwrap_err().starts_with("Invalid native playback response:"));
        assert_eq!(parse_response(r#"{"ok":false,"error":"Stale control generation"}"#), Err("Stale control generation".into()));
        assert_eq!(parse_response(r#"{"ok":true,"value":{"kind":"rejected","sessionId":"s","sequence":2,"controlGeneration":"7","code":"protocol"}}"#),
            Ok(json!({"kind":"rejected","sessionId":"s","sequence":2,"controlGeneration":"7","code":"protocol"})));
    }

    #[test]
    fn unknown_stop_does_not_register_identity_or_advance_global_epoch() {
        let service = PlaybackService::default();
        let main = QueuedDispatcher::default();
        let mut stopping = std::pin::pin!(service.stop(&main, "unknown".into(), "other".into(), 1));
        assert_eq!(poll(stopping.as_mut()), Poll::Ready(Ok(())));
        assert_eq!(service.owner.stop_epoch.load(Ordering::Acquire), 0);
        assert!(service.owner.lease_stop_tokens.lock().unwrap().is_empty());
        assert!(main.0.lock().unwrap().is_empty());
        assert_eq!(service.owner.handle.load(Ordering::Acquire), 0);
    }

    #[test]
    fn queued_note_panic_rechecks_released_lease_without_advancing_stop() {
        let service = PlaybackService::default();
        let main = QueuedDispatcher::default();
        let mut panic = std::pin::pin!(service.all_notes_off(&main, "lease".into(), "s".into(), 7));
        assert!(poll(panic.as_mut()).is_pending());
        service.owner.released_leases.lock().unwrap().insert("lease".into());
        main.run_next();
        assert_eq!(poll(panic.as_mut()), Poll::Ready(Err("Playback lease was released".into())));
        assert_eq!(service.owner.stop_epoch.load(Ordering::Acquire), 0);
        assert_eq!(service.owner.handle.load(Ordering::Acquire), 0);
    }

    #[test]
    fn released_note_quota_does_not_starve_new_session_or_share_overrun_panic() {
        let service = PlaybackService::default();
        let main = QueuedDispatcher::default();
        let old_queue = register_note_session(&service, &main, "old", "old-session");
        old_queue.pending.store(4096, Ordering::Release);
        let mut old_panic = Box::pin(service.note(&main, json!({"sessionId": "old-session", "sequence": 0}), "old".into(), 0));
        assert!(poll(old_panic.as_mut()).is_pending());
        drop(old_panic);
        assert!(old_queue.overrun.load(Ordering::Acquire));
        let mut release = Box::pin(service.release(&main, "old".into()));
        assert!(poll(release.as_mut()).is_pending());
        drop(release);
        service.acquire("new".into(), "new-session".into()).unwrap();
        let mut opening = Box::pin(service.apply(&main, json!({"sessionId": "new-session"}), "new".into(), 0));
        assert!(poll(opening.as_mut()).is_pending());
        drop(opening);
        let new_queue = service.owner.note_queue("new", "new-session").unwrap();
        let mut note = Box::pin(service.note(&main, json!({"sessionId": "new-session", "sequence": 0}), "new".into(), 0));
        assert!(poll(note.as_mut()).is_pending());
        assert_eq!(new_queue.pending.load(Ordering::Acquire), 1);
        assert!(!new_queue.overrun.load(Ordering::Acquire));
        new_queue.pending.store(4096, Ordering::Release);
        let mut new_panic = Box::pin(service.note(&main, json!({"sessionId": "new-session", "sequence": 1}), "new".into(), 0));
        assert!(poll(new_panic.as_mut()).is_pending());
        assert!(new_queue.overrun.load(Ordering::Acquire));
        assert!(old_queue.overrun.load(Ordering::Acquire));
        main.0.lock().unwrap().clear();
        assert!(!old_queue.overrun.load(Ordering::Acquire));
        assert!(!new_queue.overrun.load(Ordering::Acquire));
        assert_eq!(service.owner.handle.load(Ordering::Acquire), 0);
    }

    #[test]
    fn stop_replaces_note_quota_without_waiting_for_old_dispatched_notes() {
        let service = PlaybackService::default();
        let main = QueuedDispatcher::default();
        let old_queue = register_note_session(&service, &main, "lease", "s");
        old_queue.pending.store(4096, Ordering::Release);
        old_queue.overrun.store(true, Ordering::Release);
        let mut stopping = std::pin::pin!(service.stop(&main, "lease".into(), "s".into(), 1));
        assert!(poll(stopping.as_mut()).is_pending());
        let new_queue = service.owner.note_queue("lease", "s").unwrap();
        assert!(!Arc::ptr_eq(&old_queue, &new_queue));
        let mut note = std::pin::pin!(service.note(&main, json!({"sessionId": "s", "sequence": 1}), "lease".into(), 1));
        assert!(poll(note.as_mut()).is_pending());
        assert_eq!(new_queue.pending.load(Ordering::Acquire), 1);
        assert!(!new_queue.overrun.load(Ordering::Acquire));
        main.0.lock().unwrap().clear();
        assert_eq!(new_queue.pending.load(Ordering::Acquire), 0);
    }

    #[test]
    fn note_panic_rejects_unsafe_cutoff_before_dispatch() {
        let service = PlaybackService::default();
        let main = QueuedDispatcher::default();
        let mut panic = std::pin::pin!(service.all_notes_off(&main, "lease".into(), "s".into(), MAX_SAFE_INTEGER + 1));
        assert_eq!(poll(panic.as_mut()), Poll::Ready(Err("Invalid note cutoff sequence".into())));
        assert!(main.0.lock().unwrap().is_empty());
        assert_eq!(service.owner.handle.load(Ordering::Acquire), 0);
    }

    #[test]
    fn admission_is_idempotent_bounded_and_rejects_released_or_changed_identity() {
        let service = PlaybackService::default();
        service.acquire("lease-0".into(), "s".into()).unwrap();
        let original = service.owner.note_queue("lease-0", "s").unwrap();
        service.acquire("lease-0".into(), "s".into()).unwrap();
        assert!(Arc::ptr_eq(&original, &service.owner.note_queue("lease-0", "s").unwrap()));
        assert_eq!(service.acquire("lease-0".into(), "other".into()), Err("Playback lease is already admitted for another session".into()));
        for index in 1..MAX_PLAYBACK_LEASES { service.acquire(format!("lease-{index}"), "s".into()).unwrap(); }
        assert_eq!(service.acquire("extra".into(), "s".into()), Err("Playback lease capacity reached".into()));
        service.owner.released_leases.lock().unwrap().insert("released".into());
        assert_eq!(service.acquire("released".into(), "s".into()), Err("Playback lease was released".into()));
        assert!(service.acquire("".into(), "s".into()).is_err());
        assert!(service.acquire("valid".into(), "".into()).is_err());
        assert_eq!(service.owner.handle.load(Ordering::Acquire), 0);
    }

    #[test]
    fn unadmitted_apply_is_rejected_before_main_dispatch() {
        let service = PlaybackService::default();
        let main = QueuedDispatcher::default();
        let mut opening = std::pin::pin!(service.apply(&main, json!({"sessionId": "s"}), "unknown".into(), 0));
        assert_eq!(poll(opening.as_mut()), Poll::Ready(Err("Playback lease was not acquired".into())));
        assert!(main.0.lock().unwrap().is_empty());
        assert!(service.owner.lease_stop_tokens.lock().unwrap().is_empty());
    }

    #[test]
    fn admitted_stop_before_apply_future_poll_blocks_old_open() {
        let service = PlaybackService::default();
        let main = QueuedDispatcher::default();
        service.acquire("lease".into(), "s".into()).unwrap();
        let mut opening = std::pin::pin!(service.apply(&main, json!({"sessionId": "s", "sequence": 0, "controlGeneration": "0", "stage": "open"}), "lease".into(), 0));
        let mut stopping = std::pin::pin!(service.stop(&main, "lease".into(), "s".into(), 1));
        assert!(poll(stopping.as_mut()).is_pending());
        assert!(poll(opening.as_mut()).is_pending());
        let stop_action = main.0.lock().unwrap().pop_front().unwrap();
        main.run_next();
        assert_eq!(poll(opening.as_mut()), Poll::Ready(Ok(json!({"kind":"rejected", "sessionId":"s", "sequence":0, "controlGeneration":"0", "code":"superseded-open"}))));
        assert_eq!(service.owner.handle.load(Ordering::Acquire), 0);
        drop(stop_action);
        assert_eq!(poll(stopping.as_mut()), Poll::Ready(Err("Main-thread playback operation was cancelled".into())));
    }
