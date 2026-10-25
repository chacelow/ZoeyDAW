use std::sync::Mutex;
use tauri::{LogicalPosition, State, Window};

struct Owner {
  window: Window,
  token: String,
  origin: LogicalPosition<f64>,
}

#[derive(Default)]
pub struct CursorLock(Mutex<Option<Owner>>);

fn release(owner: Owner) -> Result<(), String> {
  let ungrab = owner.window.set_cursor_grab(false);
  let restore = owner.window.set_cursor_position(owner.origin);
  let reveal = owner.window.set_cursor_visible(true);
  ungrab.and(restore).and(reveal).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn cursor_lock_acquire(
  window: Window,
  state: State<'_, CursorLock>,
  token: String,
  x: f64,
  y: f64,
) -> Result<(), String> {
  if token.is_empty() || !x.is_finite() || !y.is_finite() {
    return Err("Invalid cursor lock origin or token".into());
  }
  let mut current = state.inner().0.lock().map_err(|error| error.to_string())?;
  if current.is_some() {
    return Err("Cursor already owned".into());
  }
  if !window.is_focused().map_err(|error| error.to_string())? {
    return Err("Cursor lock requires a focused window".into());
  }
  window.set_cursor_visible(false).map_err(|error| error.to_string())?;
  if let Err(error) = window.set_cursor_grab(true) {
    let _ = window.set_cursor_visible(true);
    return Err(error.to_string());
  }
  *current = Some(Owner { window, token, origin: LogicalPosition::new(x, y) });
  Ok(())
}

#[tauri::command]
pub fn cursor_lock_release(
  window: Window,
  state: State<'_, CursorLock>,
  token: String,
  x: Option<f64>,
  y: Option<f64>,
) -> Result<(), String> {
  let mut current = state.inner().0.lock().map_err(|error| error.to_string())?;
  if current.as_ref().is_some_and(|owner| owner.window.label() == window.label() && owner.token == token) {
    if let Some(mut owner) = current.take() {
      if let (Some(x), Some(y)) = (x, y) {
        if x.is_finite() && y.is_finite() { owner.origin = LogicalPosition::new(x, y); }
      }
      return release(owner);
    }
  }
  Ok(())
}

pub fn release_window(window: &Window, state: &CursorLock) {
  let Ok(mut current) = state.0.lock() else { return };
  if current.as_ref().is_some_and(|owner| owner.window.label() == window.label()) {
    if let Some(owner) = current.take() {
      if let Err(error) = release(owner) {
        log::warn!("Cursor lock cleanup failed: {error}");
      }
    }
  }
}
