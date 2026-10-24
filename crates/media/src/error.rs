use std::{io, path::Path};

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaError {
  pub code: String,
  pub message: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub path: Option<String>,
}

impl MediaError {
  pub(crate) fn new(code: &str, message: impl Into<String>, path: Option<&Path>) -> Self {
    Self {
      code: code.into(),
      message: message.into(),
      path: path.map(|path| path.to_string_lossy().into_owned()),
    }
  }

  pub(crate) fn io(error: io::Error, path: &Path) -> Self {
    let code = if error.kind() == io::ErrorKind::NotFound { "not-found" } else { "io" };
    Self::new(code, error.to_string(), Some(path))
  }
}

pub type MediaResult<T> = Result<T, MediaError>;
