//! zoeydaw desktop shell and IPC adapters for the independent core packages.

use tauri::{
  Manager,
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

mod atomic_file;
mod cursor_lock;
mod log_config;
mod project_storage;
mod application_lifecycle;
mod browser_catalog;
mod playback;
mod plugin_catalog;

/// 前端挂载完成通知；目前只用来晚显示主窗口 (避免启动闪白)。
#[tauri::command]
fn frontend_ready(window: tauri::Window) -> Result<(), String> {
  window.show().map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let application = tauri::Builder::default()
    .manage(application_lifecycle::ApplicationCloseGuard::default())
    .manage(cursor_lock::CursorLock::default())
    .manage(zoeydaw_engine::PlaybackService::default())
    .manage(playback::RecordingInspections::default())
    .manage(playback::realtime_probe::RealtimeProbeService::default())
    .manage(plugin_catalog::PluginCatalogState::default())
    .manage(playback::plugin_devices::PluginDevices::default())
    .on_window_event(|window, event| {
      if matches!(event, tauri::WindowEvent::Focused(false) | tauri::WindowEvent::Destroyed) {
        if let Some(cursor) = window.app_handle().try_state::<cursor_lock::CursorLock>() {
          cursor_lock::release_window(window, &cursor);
        }
      }
      if matches!(event, tauri::WindowEvent::Destroyed) {
        if let Some(service) = window.app_handle().try_state::<zoeydaw_engine::PlaybackService>() {
          if let Err(error) = service.close_meter_window(window.label()) {
            log::error!("Meter window cleanup failed: {error}");
          }
        }
        if let Some(probes) = window.app_handle().try_state::<playback::realtime_probe::RealtimeProbeService>() {
          probes.close_window(window.label());
        }
        if let Some(catalog) = window.app_handle().try_state::<plugin_catalog::PluginCatalogState>() {
          catalog.close_window(window.label());
        }
        if let Some(plugins) = window.app_handle().try_state::<playback::plugin_devices::PluginDevices>() {
          playback::plugin_devices::release_window(window.app_handle().clone(), plugins.close_window(window.label()));
        }
      }
      if window.label() == "main" {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
          api.prevent_close();
          application_lifecycle::request(window.app_handle(), application_lifecycle::CloseIntent::CloseButton);
        }
      }
    })
    .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.unminimize();
      }
    }))
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
      cursor_lock::cursor_lock_acquire,
      cursor_lock::cursor_lock_release,
      plugin_catalog::plugin_catalog_entries,
      plugin_catalog::plugin_catalog_reserve,
      plugin_catalog::plugin_catalog_scan,
      plugin_catalog::plugin_catalog_cancel,
      playback::plugin_seed::plugin_device_seed,
      playback::plugin_controls::plugin_device_parameters,
      playback::plugin_controls::plugin_device_snapshot,
      playback::plugin_editor::plugin_device_editor,
      playback::realtime_probe::realtime_probe_open,
      playback::realtime_probe::realtime_probe_pull,
      playback::realtime_probe::realtime_probe_receipt,
      playback::realtime_probe::realtime_probe_close,
      playback::realtime_probe::realtime_probe_clock,
      atomic_file::write_file_atomically,
      project_storage::inspect_project_media,
      project_storage::open_project_file,
      project_storage::save_project_file,
      project_storage::cancel_project_file,
      project_storage::relink_project_media,
      browser_catalog::browser_roots,
      browser_catalog::browser_add_root,
      browser_catalog::browser_refresh_root,
      browser_catalog::browser_cancel_scan,
      browser_catalog::browser_remove_root,
      browser_catalog::browser_tree,
      playback::playback_acquire,
      playback::playback_apply,
      playback::playback_control,
      playback::playback_note,
      playback::playback_all_notes_off,
      playback::playback_telemetry,
      playback::realtime_stream::playback_stream_open,
      playback::realtime_stream::playback_stream_registry,
      playback::realtime_stream::playback_clock_probe,
      playback::realtime_stream::playback_meter_interest,
      playback::realtime_stream::playback_stream_close,
      playback::realtime_stream::playback_meter_snapshot,
      playback::realtime_stream::playback_event_receipt,
      playback::realtime_stream::playback_meter_reset,
      playback::recording_results,
      playback::recording_ack,
      playback::playback_release,
      playback::playback_stop,
      playback::playback_audition_reserve,
      playback::playback_audition,
      playback::playback_audition_stop,
      playback::playback_audition_seek,
      playback::playback_audition_status,
      playback::playback_analyze_tempo,
      playback::playback_devices,
      playback::playback_configure_device,
      playback::playback_device_capabilities,
      playback::playback_device_control_panel,
      playback::playback_waveform,
      playback::playback_waveform_range,
      playback::playback_waveform_range_cancel,
      application_lifecycle::request_app_close,
      application_lifecycle::get_pending_app_close,
      application_lifecycle::resolve_app_close,
      frontend_ready,
      log_config::get_log_config,
      log_config::open_log_dir,
      log_config::set_log_level,
      log_config::set_log_dir,
      log_config::clear_logs,
    ])
    .setup(|app| {
      app.manage(zoeydaw_browser::BrowserCatalog::new(app.path().app_data_dir()?)?);
      if let Some(window) = app.get_webview_window("main") {
        #[cfg(target_os = "windows")]
        {
          let _ = window.set_decorations(false);
        }
        log::info!("tauri window ready: {:?}", window.label());
      }

      // 系统托盘：左键切换窗口显隐，菜单提供 显示/隐藏/退出。
      let show_item = MenuItem::with_id(app, "tray_show", "显示 zoeydaw", true, None::<&str>)?;
      let hide_item = MenuItem::with_id(app, "tray_hide", "隐藏窗口", true, None::<&str>)?;
      let quit_item = MenuItem::with_id(app, "tray_quit", "退出 zoeydaw", true, None::<&str>)?;
      let tray_menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;
      let mut tray_builder = TrayIconBuilder::with_id("main")
        .tooltip("zoeydaw")
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "tray_show" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.show();
              let _ = window.unminimize();
              let _ = window.set_focus();
            }
          }
          "tray_hide" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.hide();
            }
          }
          "tray_quit" => {
            application_lifecycle::request(app, application_lifecycle::CloseIntent::ExplicitExit);
          }
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            let app = tray.app_handle();
            if let Some(window) = app.get_webview_window("main") {
              let visible = window.is_visible().unwrap_or(false);
              let minimized = window.is_minimized().unwrap_or(false);
              if visible && !minimized {
                let _ = window.hide();
              } else {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
              }
            }
          }
        });
      if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
      }
      tray_builder.build(app)?;

      // 日志系统：LogDir (~/Library/Logs/{bundleId}) 或用户自定义目录 + Stdout (dev)。
      // 级别用 log::set_max_level 控制，前端切换免重启；目录改动需要重启才生效。
      let persisted = log_config::load(app.handle());
      let active_dir = log_config::resolved_log_dir(app.handle())?;
      std::fs::create_dir_all(&active_dir)?;
      log_config::stash_active_dir(active_dir.clone());

      let file_target = if persisted.dir.is_some() {
        tauri_plugin_log::TargetKind::Folder {
          path: active_dir,
          file_name: None,
        }
      } else {
        tauri_plugin_log::TargetKind::LogDir { file_name: None }
      };
      let mut targets = vec![tauri_plugin_log::Target::new(file_target)];
      if cfg!(debug_assertions) {
        targets.push(tauri_plugin_log::Target::new(
          tauri_plugin_log::TargetKind::Stdout,
        ));
        targets.push(tauri_plugin_log::Target::new(
          tauri_plugin_log::TargetKind::Webview,
        ));
      }
      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .targets(targets)
          .level(log::LevelFilter::Trace)
          .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(7))
          .max_file_size(5 * 1024 * 1024)
          .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
          .build(),
      )?;
      log::set_max_level(persisted.level.to_filter());
      log::info!(
        "log system ready, level={:?}, dir={:?}",
        persisted.level,
        persisted.dir.as_deref().unwrap_or("<default>")
      );

      // Panic hook：Rust panic 走同一根 log 管道，落进 app.log。
      use std::sync::Once;
      static PANIC_HOOK: Once = Once::new();
      PANIC_HOOK.call_once(|| {
        let default_hook = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
          let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "<unknown>".into());
          let payload = info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| info.payload().downcast_ref::<String>().map(String::as_str))
            .unwrap_or("<non-string panic>");
          log::error!("panic at {location}: {payload}");
          default_hook(info);
        }));
      });
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application");
  application.run(|app, event| {
    if let tauri::RunEvent::ExitRequested { api, .. } = event {
      if !application_lifecycle::take_exit_authorization(app) {
        api.prevent_exit();
        application_lifecycle::request(app, application_lifecycle::CloseIntent::ExplicitExit);
      }
    }
  });
}
