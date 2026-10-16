#![cfg_attr(test, allow(dead_code))]

use napi_derive::napi;

mod app_state;
mod atomic_file;
mod clipboard;
mod cursor;
mod engine;
mod external;
mod log;
mod reduced_motion;
mod settings;
mod window_geometry;
mod window_diagnostics;

#[napi]
pub fn native_version() -> String {
    format!("zoeydaw-native {} / engine {}", env!("CARGO_PKG_VERSION"), zoeydaw_engine::version())
}
