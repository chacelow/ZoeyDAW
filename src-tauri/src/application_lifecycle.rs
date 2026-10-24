use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CloseIntent {
  CloseButton,
  ExplicitExit,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseRequest {
  request_id: String,
  intent: CloseIntent,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CloseResolution {
  Cancel,
  Hide,
  Exit,
}

#[derive(Default)]
struct GuardState {
  pending: Option<CloseRequest>,
  authorized_exit: bool,
}

impl GuardState {
  fn request(&mut self, intent: CloseIntent) -> Option<CloseRequest> {
    if let Some(pending) = &mut self.pending {
      if intent == CloseIntent::ExplicitExit && pending.intent != intent {
        pending.intent = intent;
        return Some(pending.clone());
      }
      return None;
    }
    let request = CloseRequest {
      request_id: uuid::Uuid::new_v4().to_string(),
      intent,
    };
    self.pending = Some(request.clone());
    Some(request)
  }

  fn resolve(&mut self, request_id: &str, action: CloseResolution) -> Result<bool, String> {
    let Some(pending) = &self.pending else {
      return Ok(false);
    };
    if pending.request_id != request_id {
      return Ok(false);
    }
    if matches!(action, CloseResolution::Hide) && pending.intent == CloseIntent::ExplicitExit {
      return Err("An explicit exit request cannot hide the application".into());
    }
    self.pending = None;
    self.authorized_exit = matches!(action, CloseResolution::Exit);
    Ok(true)
  }

  fn take_exit_authorization(&mut self) -> bool {
    std::mem::take(&mut self.authorized_exit)
  }
}

#[derive(Default)]
pub struct ApplicationCloseGuard(Mutex<GuardState>);

pub fn request(app: &AppHandle, intent: CloseIntent) {
  let guard = app.state::<ApplicationCloseGuard>();
  let pending = match guard.0.lock() {
    Ok(mut state) => state.request(intent),
    Err(error) => {
      log::error!("could not request application close: {error}");
      return;
    }
  };
  if let Some(request) = pending {
    if let Some(window) = app.get_webview_window("main") {
      let _ = window.show();
      let _ = window.unminimize();
      let _ = window.set_focus();
    }
    if let Err(error) = app.emit_to("main", "application-close-requested", request) {
      log::error!("could not notify frontend of application close: {error}");
    }
  }
}

pub fn take_exit_authorization(app: &AppHandle) -> bool {
  app.state::<ApplicationCloseGuard>()
    .0
    .lock()
    .map(|mut state| state.take_exit_authorization())
    .unwrap_or(false)
}

#[tauri::command]
pub fn request_app_close(app: AppHandle) {
  request(&app, CloseIntent::CloseButton);
}

#[tauri::command]
pub fn get_pending_app_close(guard: State<'_, ApplicationCloseGuard>) -> Result<Option<CloseRequest>, String> {
  guard.0.lock().map(|state| state.pending.clone()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn resolve_app_close(app: AppHandle, guard: State<'_, ApplicationCloseGuard>, request_id: String, action: CloseResolution) -> Result<bool, String> {
  let accepted = guard.0.lock().map_err(|error| error.to_string())?.resolve(&request_id, action)?;
  if !accepted {
    return Ok(false);
  }
  match action {
    CloseResolution::Cancel => {},
    CloseResolution::Hide => {
      let window = app.get_webview_window("main").ok_or("Main window is unavailable")?;
      window.hide().map_err(|error| error.to_string())?;
    },
    CloseResolution::Exit => app.exit(0),
  }
  Ok(true)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn requests_fail_closed_and_repeated_intents_share_one_ticket() {
    let mut guard = GuardState::default();
    assert!(!guard.take_exit_authorization());
    let request = guard.request(CloseIntent::CloseButton).unwrap();
    assert!(guard.request(CloseIntent::CloseButton).is_none());
    assert!(!guard.take_exit_authorization());
    assert_eq!(guard.pending.as_ref().unwrap().request_id, request.request_id);
  }

  #[test]
  fn explicit_quit_upgrades_close_but_cannot_be_resolved_to_hide() {
    let mut guard = GuardState::default();
    let close = guard.request(CloseIntent::CloseButton).unwrap();
    let quit = guard.request(CloseIntent::ExplicitExit).unwrap();
    assert_eq!(close.request_id, quit.request_id);
    assert_eq!(quit.intent, CloseIntent::ExplicitExit);
    assert!(guard.resolve(&close.request_id, CloseResolution::Hide).is_err());
    assert!(guard.pending.is_some());
    assert!(!guard.take_exit_authorization());
  }

  #[test]
  fn cancel_and_hide_keep_the_owner_alive_without_exit_authorization() {
    for action in [CloseResolution::Cancel, CloseResolution::Hide] {
      let mut guard = GuardState::default();
      let request = guard.request(CloseIntent::CloseButton).unwrap();
      assert!(guard.resolve(&request.request_id, action).unwrap());
      assert!(guard.pending.is_none());
      assert!(!guard.take_exit_authorization());
    }
  }

  #[test]
  fn exit_authorization_is_ticket_bound_and_consumed_once() {
    let mut guard = GuardState::default();
    let request = guard.request(CloseIntent::ExplicitExit).unwrap();
    assert!(!guard.resolve("stale-ticket", CloseResolution::Exit).unwrap());
    assert!(!guard.take_exit_authorization());
    assert!(guard.resolve(&request.request_id, CloseResolution::Exit).unwrap());
    assert!(guard.take_exit_authorization());
    assert!(!guard.take_exit_authorization());
    assert!(!guard.resolve(&request.request_id, CloseResolution::Exit).unwrap());
  }
}
