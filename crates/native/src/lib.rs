//! zoeydaw 原生桥。每个能力一个模块,各自由对应切片拥有;此文件只做模块登记。
//!
//! 测试构建:`#[napi]` 导出只在非测试构建里被注册,`cargo test` 目标里这些函数看起来
//! 没被使用。下面的 `allow(dead_code)` 只对测试目标生效,在 crate 根一处声明,新增模块
//! 不必各自重复;非测试构建仍以 `clippy -D warnings` 把关。
#![cfg_attr(test, allow(dead_code))]

use napi_derive::napi;

mod app_state;
mod atomic_file;
mod clipboard;
mod cursor;
mod engine;
mod external;
mod log;
mod settings;
mod window_geometry;
mod window_diagnostics;

/// 管线连通性探针:证明 Rust → napi → Bun 的加载路径可用。
#[napi]
pub fn native_version() -> String {
    format!("zoeydaw-native {} / engine {}", env!("CARGO_PKG_VERSION"), zoeydaw_engine::version())
}
