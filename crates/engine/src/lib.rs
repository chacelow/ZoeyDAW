//! 纯 Rust 引擎核心。不依赖 napi 或任何 UI;由 `crates/native` 经 napi 暴露给 TS。

#![forbid(unsafe_code)]

pub mod assets;
pub mod defaults;
pub mod mix;
pub mod session;
mod realtime;
pub mod peaks;
pub mod protocol;
pub mod transport;

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
