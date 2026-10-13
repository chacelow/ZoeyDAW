//! zoeydaw desktop shell — Tauri 2 骨架。
//!
//! Prototype 阶段只装载通用插件和两个真正通用的命令模块：
//!   - [`atomic_file`]：原子写文件 (前端工程/录音落盘共用)
//!   - [`log_config`]：日志级别/目录运行时配置
//!
//! AI chat / HTTP stream / MCP / 文档门户 / `.zmind` 关联、多 Tab 守卫等
//! ZoeyMind 产物已全部移除；DAW 的音频引擎、插件 host、Browser 等 crate 另开。

use tauri::{
  Manager,
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

mod atomic_file;
mod log_config;

/// 前端挂载完成通知；目前只用来晚显示主窗口 (避免启动闪白)。
#[tauri::command]
fn frontend_ready(window: tauri::Window) -> Result<(), String> {
  window.show().map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
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
      atomic_file::write_file_atomically,
      frontend_ready,
      log_config::get_log_config,
      log_config::open_log_dir,
      log_config::set_log_level,
      log_config::set_log_dir,
      log_config::clear_logs,
    ])
    .setup(|app| {
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
            app.exit(0);
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
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
