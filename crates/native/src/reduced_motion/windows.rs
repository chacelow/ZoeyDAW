use std::{
    cell::RefCell,
    collections::BTreeSet,
    ptr,
    sync::{mpsc, Mutex},
    thread::{self, JoinHandle},
};

use windows_sys::{
    core::w,
    Win32::{
        Foundation::{HWND, LPARAM, LRESULT, WPARAM},
        System::{LibraryLoader::GetModuleHandleW, Threading::GetCurrentThreadId},
        UI::WindowsAndMessaging::{
            CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
            PostThreadMessageW, RegisterClassW, SystemParametersInfoW, TranslateMessage,
            UnregisterClassW, MSG, SPI_GETCLIENTAREAANIMATION, WM_QUIT, WM_SETTINGCHANGE,
            WNDCLASSW,
        },
    },
};

use super::Listener;

struct Observation {
    listener: Listener,
    last: Option<bool>,
}

impl Observation {
    fn update(&mut self, reduced: bool) {
        if self.last != Some(reduced) {
            self.last = Some(reduced);
            (self.listener)(reduced);
        }
    }
}

thread_local! {
    static OBSERVATION: RefCell<Option<Observation>> = const { RefCell::new(None) };
    static HOOK_ENVS: RefCell<BTreeSet<usize>> = const { RefCell::new(BTreeSet::new()) };
}

struct Registration {
    env: usize,
    thread_id: u32,
    thread: JoinHandle<()>,
    #[cfg(test)]
    hwnd: usize,
}

impl Registration {
    fn stop(self) {
        // The message queue exists before the registration becomes visible. A
        // thread message avoids a dangling HWND and is also safe after exit.
        unsafe {
            PostThreadMessageW(self.thread_id, WM_QUIT, 0, 0);
        }
        let _ = self.thread.join();
    }
}

static REGISTRATION: Mutex<Option<Registration>> = Mutex::new(None);

fn read() -> Result<bool, String> {
    let mut animate: i32 = 0;
    if unsafe {
        SystemParametersInfoW(
            SPI_GETCLIENTAREAANIMATION,
            0,
            ptr::addr_of_mut!(animate).cast(),
            0,
        )
    } == 0
    {
        return Err("SPI_GETCLIENTAREAANIMATION failed".into());
    }
    Ok(animate == 0)
}

pub fn reduced_motion() -> napi::Result<bool> {
    read().map_err(napi::Error::from_reason)
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if message == WM_SETTINGCHANGE {
        if let Ok(reduced) = read() {
            OBSERVATION.with(|observation| {
                if let Some(observation) = observation.borrow_mut().as_mut() {
                    observation.update(reduced);
                }
            });
        }
    }
    unsafe { DefWindowProcW(hwnd, message, wparam, lparam) }
}

struct MessageWindow(HWND);

impl MessageWindow {
    fn new() -> Result<Self, String> {
        let instance = unsafe { GetModuleHandleW(ptr::null()) };
        let class = WNDCLASSW {
            lpfnWndProc: Some(window_proc),
            hInstance: instance,
            lpszClassName: w!("ZoeydawReducedMotionObserver"),
            ..Default::default()
        };
        if unsafe { RegisterClassW(&class) } == 0 {
            return Err("RegisterClassW failed for reduced motion observer".into());
        }
        // Not HWND_MESSAGE: only a hidden top-level window receives broadcasts.
        let hwnd = unsafe {
            CreateWindowExW(
                0,
                class.lpszClassName,
                w!(""),
                0,
                0,
                0,
                0,
                0,
                ptr::null_mut(),
                ptr::null_mut(),
                instance,
                ptr::null(),
            )
        };
        if hwnd.is_null() {
            unsafe {
                UnregisterClassW(class.lpszClassName, instance);
            }
            Err("CreateWindowExW failed for reduced motion observer".into())
        } else {
            Ok(Self(hwnd))
        }
    }
}

impl Drop for MessageWindow {
    fn drop(&mut self) {
        unsafe {
            DestroyWindow(self.0);
            UnregisterClassW(
                w!("ZoeydawReducedMotionObserver"),
                GetModuleHandleW(ptr::null()),
            );
        }
    }
}

fn start(env: usize, listener: Listener) -> napi::Result<Registration> {
    let (ready, result) = mpsc::sync_channel(1);
    let thread = thread::Builder::new()
        .name("zoeydaw-motion".into())
        .spawn(move || {
            let window = match MessageWindow::new() {
                Ok(window) => window,
                Err(error) => {
                    let _ = ready.send(Err(error));
                    return;
                }
            };
            let reduced = match read() {
                Ok(reduced) => reduced,
                Err(error) => {
                    let _ = ready.send(Err(error));
                    return;
                }
            };
            OBSERVATION.with(|slot| {
                let mut observation = Observation {
                    listener,
                    last: None,
                };
                observation.update(reduced);
                *slot.borrow_mut() = Some(observation);
            });
            if ready
                .send(Ok((unsafe { GetCurrentThreadId() }, window.0 as usize)))
                .is_ok()
            {
                let mut message = MSG::default();
                while unsafe { GetMessageW(&mut message, ptr::null_mut(), 0, 0) } > 0 {
                    unsafe {
                        TranslateMessage(&message);
                        DispatchMessageW(&message);
                    }
                }
            }
            OBSERVATION.with(|slot| slot.borrow_mut().take());
            drop(window);
        })
        .map_err(|error| napi::Error::from_reason(error.to_string()))?;
    match result.recv() {
        Ok(Ok((thread_id, _hwnd))) => Ok(Registration {
            env,
            thread_id,
            thread,
            #[cfg(test)]
            hwnd: _hwnd,
        }),
        failure => {
            let _ = thread.join();
            Err(napi::Error::from_reason(match failure {
                Ok(Err(error)) => error,
                Err(error) => error.to_string(),
                Ok(Ok(_)) => unreachable!(),
            }))
        }
    }
}

fn replace(env: usize, listener: Option<Listener>) -> napi::Result<()> {
    let mut registration = REGISTRATION
        .lock()
        .map_err(|_| napi::Error::from_reason("reduced motion observer lock poisoned"))?;
    if let Some(previous) = registration.take() {
        previous.stop();
    }
    if let Some(listener) = listener {
        *registration = Some(start(env, listener)?);
    }
    Ok(())
}

fn cleanup(env: usize) {
    HOOK_ENVS.with(|envs| envs.borrow_mut().remove(&env));
    let mut registration = REGISTRATION
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    if registration
        .as_ref()
        .is_some_and(|registration| registration.env == env)
    {
        if let Some(registration) = registration.take() {
            registration.stop();
        }
    }
}

pub fn set_listener(env: napi::Env, listener: Option<Listener>) -> napi::Result<()> {
    let key = env.raw() as usize;
    HOOK_ENVS.with(|envs| {
        let mut envs = envs.borrow_mut();
        if !envs.contains(&key) {
            env.add_env_cleanup_hook(key, cleanup)?;
            envs.insert(key);
        }
        Ok::<_, napi::Error>(())
    })?;
    replace(key, listener)
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows_sys::Win32::UI::WindowsAndMessaging::SendMessageW;

    #[test]
    fn observation_emits_baseline_and_each_transition_only() {
        let (sink, seen) = mpsc::channel();
        let mut observation = Observation {
            listener: Box::new(move |value| {
                sink.send(value).unwrap();
            }),
            last: None,
        };
        for value in [false, false, true, true, false] {
            observation.update(value);
        }
        assert_eq!(
            seen.try_iter().collect::<Vec<_>>(),
            vec![false, true, false]
        );
    }

    fn registered() -> Option<(usize, usize)> {
        let registration = REGISTRATION
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        registration
            .as_ref()
            .map(|registration| (registration.env, registration.hwnd))
    }

    #[test]
    fn real_message_window_replacement_removal_and_env_cleanup() {
        let current = reduced_motion().unwrap();
        let (sink, seen) = mpsc::channel();
        replace(
            1,
            Some(Box::new(move |value| {
                sink.send(value).unwrap();
            })),
        )
        .unwrap();
        assert_eq!(seen.try_iter().collect::<Vec<_>>(), vec![current]);
        let hwnd = registered().unwrap().1 as HWND;
        unsafe {
            SendMessageW(hwnd, WM_SETTINGCHANGE, 0, 0);
        }
        assert!(seen.try_recv().is_err());

        let (sink, replaced) = mpsc::channel();
        replace(
            2,
            Some(Box::new(move |value| {
                sink.send(value).unwrap();
            })),
        )
        .unwrap();
        cleanup(1);
        assert_eq!(registered().unwrap().0, 2);
        assert_eq!(replaced.try_iter().collect::<Vec<_>>(), vec![current]);
        cleanup(2);
        assert!(registered().is_none());
        assert!(seen.try_recv().is_err());
        replace(3, Some(Box::new(|_| {}))).unwrap();
        replace(3, None).unwrap();
        assert!(registered().is_none());
    }
}
