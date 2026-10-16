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
