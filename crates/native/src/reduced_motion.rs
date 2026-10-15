//! 系统「减少动态效果」设置：同步读取与变化订阅。GPUI 的 `App::reduce_motion` 不从系统读取,
//! 所以由这里直接读 NSWorkspace。只有 macOS 实现;其它平台返回明确错误,不猜默认值。
use napi::{
    bindgen_prelude::{Either, Function, Null},
    threadsafe_function::ThreadsafeFunctionCallMode,
    Result,
};
use napi_derive::napi;

type Listener = Box<dyn Fn(bool) + Send + Sync>;

/// Whether the user asked the system to reduce motion.
#[napi]
pub fn reduced_motion() -> Result<bool> {
    platform::reduced_motion()
}

/// Subscribe to the system reduce-motion setting. The first asynchronous callback
/// reports the current value; later callbacks report changes. Passing null removes
/// the observer. One observer per process; a new callback replaces the old one.
#[napi]
pub fn on_reduced_motion_change(
    #[napi(ts_arg_type = "((reduced: boolean) => void) | null")] callback: Either<
        Function<'_, bool, ()>,
        Null,
    >,
) -> Result<()> {
    let listener = match callback {
        Either::A(callback) => {
            let callback = callback
                .build_threadsafe_function::<bool>()
                .callee_handled::<false>()
                .weak::<true>()
                .build()?;
            Some(Box::new(move |reduced| {
                callback.call(reduced, ThreadsafeFunctionCallMode::NonBlocking);
            }) as Listener)
        }
        Either::B(_) => None,
    };
    platform::set_listener(listener)
}

#[cfg(target_os = "macos")]
mod platform {
    use std::sync::Mutex;

    use objc2::rc::Retained;
    use objc2::runtime::NSObject;
    use objc2::{define_class, msg_send, sel, AnyThread, DefinedClass};
    use objc2_app_kit::{NSWorkspace, NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification};
    use objc2_foundation::{NSNotification, NSObjectProtocol};

    use super::Listener;

    pub struct Ivars {
        listener: Listener,
    }

    define_class!(
        // SAFETY: NSObject has no subclassing requirements and this class does not implement Drop.
        #[unsafe(super(NSObject))]
        #[name = "ZoeydawReducedMotionObserver"]
        #[ivars = Ivars]
        struct ReducedMotionObserver;

        impl ReducedMotionObserver {
            #[unsafe(method(displayOptionsDidChange:))]
            fn display_options_did_change(&self, _notification: &NSNotification) {
                (self.ivars().listener)(read());
            }
        }

        unsafe impl NSObjectProtocol for ReducedMotionObserver {}
    );

    static REGISTRATION: Mutex<Option<Retained<ReducedMotionObserver>>> = Mutex::new(None);

    fn read() -> bool {
        NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceMotion()
    }

    pub fn reduced_motion() -> napi::Result<bool> {
        Ok(read())
    }

    pub fn set_listener(listener: Option<Listener>) -> napi::Result<()> {
        let center = NSWorkspace::sharedWorkspace().notificationCenter();
        let mut registration = REGISTRATION
            .lock()
            .map_err(|_| napi::Error::from_reason("reduced motion observer lock poisoned"))?;
        if let Some(observer) = registration.take() {
            // SAFETY: `observer` was added to this center by this module.
            unsafe { center.removeObserver(&observer) };
        }
        let Some(listener) = listener else {
            return Ok(());
        };
        // SAFETY: NSObject init accepts this allocated subclass with initialized ivars.
        let observer: Retained<ReducedMotionObserver> = unsafe {
            msg_send![
                super(ReducedMotionObserver::alloc().set_ivars(Ivars { listener })),
                init
            ]
        };
        // SAFETY: the selector matches `displayOptionsDidChange:` defined above and the
        // observer is retained in REGISTRATION until it is removed.
        unsafe {
            center.addObserver_selector_name_object(
                &observer,
                sel!(displayOptionsDidChange:),
                Some(NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification),
                None,
            );
        }
        (observer.ivars().listener)(read());
        *registration = Some(observer);
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use std::sync::{Arc, Mutex};

        use super::*;

        fn post_display_options_change() {
            let center = NSWorkspace::sharedWorkspace().notificationCenter();
            // SAFETY: a nil object is valid for this workspace notification.
            unsafe {
                center.postNotificationName_object(
                    NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification,
                    None,
                );
            }
        }

        #[test]
        fn reports_baseline_then_notifications_until_removed() {
            let current = read();
            let seen = Arc::new(Mutex::new(Vec::new()));
            let sink = seen.clone();
            set_listener(Some(Box::new(move |reduced| {
                sink.lock().unwrap().push(reduced)
            })))
            .unwrap();
            assert_eq!(*seen.lock().unwrap(), vec![current]);

            post_display_options_change();
            assert_eq!(*seen.lock().unwrap(), vec![current, current]);

            let replaced = Arc::new(Mutex::new(Vec::new()));
            let replacement = replaced.clone();
            set_listener(Some(Box::new(move |reduced| {
                replacement.lock().unwrap().push(reduced)
            })))
            .unwrap();
            post_display_options_change();
            assert_eq!(
                seen.lock().unwrap().len(),
                2,
                "replaced observer still fired"
            );
            assert_eq!(*replaced.lock().unwrap(), vec![current, current]);

            set_listener(None).unwrap();
            post_display_options_change();
            assert_eq!(
                replaced.lock().unwrap().len(),
                2,
                "removed observer still fired"
            );
            assert!(REGISTRATION.lock().unwrap().is_none());
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::Listener;

    const UNSUPPORTED: &str = "reduced motion is only read on macOS";

    pub fn reduced_motion() -> napi::Result<bool> {
        Err(napi::Error::from_reason(UNSUPPORTED))
    }

    pub fn set_listener(_listener: Option<Listener>) -> napi::Result<()> {
        Err(napi::Error::from_reason(UNSUPPORTED))
    }
}
