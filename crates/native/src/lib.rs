//! zoeydaw 原生桥。每个能力一个模块,各自由对应切片拥有;此文件只做模块登记。

use napi_derive::napi;

mod cursor;

/// 管线连通性探针:证明 Rust → napi → Bun 的加载路径可用。
#[napi]
pub fn native_version() -> String {
    format!("zoeydaw-native {} / engine {}", env!("CARGO_PKG_VERSION"), zoeydaw_engine::version())
}
