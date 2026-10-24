use std::{fmt, io, path::Path};

use serde::{Deserialize, Serialize};

mod catalog;
mod index;
mod persistence;
#[cfg(test)]
mod tests;

pub use catalog::BrowserCatalog;

pub type CatalogResult<T> = Result<T, BrowserError>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserError {
  pub code: String,
  pub message: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub path: Option<String>,
}

impl BrowserError {
  pub fn new(code: &str, message: impl Into<String>, path: Option<&Path>) -> Self {
    Self {
      code: code.into(),
      message: message.into(),
      path: path.map(|value| value.to_string_lossy().into_owned()),
    }
  }

  fn io(error: io::Error, path: &Path) -> Self {
    let code = match error.kind() {
      io::ErrorKind::NotFound => "offline",
      io::ErrorKind::PermissionDenied => "permission-denied",
      _ => "io",
    };
    Self::new(code, error.to_string(), Some(path))
  }

  fn internal() -> Self {
    Self::new("internal", "Browser catalog lock is poisoned", None)
  }
}

impl fmt::Display for BrowserError {
  fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    write!(formatter, "{}: {}", self.code, self.message)
  }
}

impl std::error::Error for BrowserError {}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BrowserRootStatus {
  Scanning,
  Ready,
  Offline,
  Cancelled,
  Error,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserRoot {
  pub id: String,
  pub name: String,
  pub path: String,
  pub status: BrowserRootStatus,
  pub operation_id: Option<String>,
  pub scanned_files: u64,
  pub audio_files: u64,
  pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserRoots {
  pub revision: u64,
  pub roots: Vec<BrowserRoot>,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BrowserItemKind {
  Folder,
  #[default]
  Audio,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BrowserItem {
  pub id: String,
  pub root_id: String,
  pub name: String,
  pub path: String,
  pub relative_path: String,
  #[serde(default)]
  pub kind: BrowserItemKind,
  pub byte_length: u64,
  pub modified_millis: u64,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BrowserTreeRow {
  #[serde(flatten)]
  pub item: BrowserItem,
  pub depth: usize,
  pub has_children: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserTreePage {
  pub request_id: String,
  pub revision: u64,
  pub total: usize,
  pub offset: usize,
  pub items: Vec<BrowserTreeRow>,
}

fn absolute_path(path: &Path) -> CatalogResult<()> {
  if !path.is_absolute()
    || path.to_str().is_none()
    || path.to_str().is_some_and(|value| value.as_bytes().contains(&0))
    || path.components().any(|part| matches!(part, std::path::Component::ParentDir))
  {
    return Err(BrowserError::new("invalid-path", "Expected an absolute UTF-8 path without parent traversal or NUL bytes", Some(path)));
  }
  Ok(())
}

