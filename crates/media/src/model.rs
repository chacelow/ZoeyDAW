use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MediaLocation {
  External { path: String },
  Project { path: String },
  Fixture { uri: String },
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaRecord {
  pub id: String,
  pub name: String,
  pub sha256: String,
  pub byte_length: u64,
  pub sample_rate: u32,
  pub frames: u64,
  pub channels: u32,
  pub location: MediaLocation,
}
