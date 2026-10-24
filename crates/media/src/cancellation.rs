pub trait Cancellation: Clone + Send + Sync + 'static {
  fn is_cancelled(&self) -> bool;
}

#[derive(Clone)]
pub struct NeverCancelled;

impl Cancellation for NeverCancelled {
  fn is_cancelled(&self) -> bool { false }
}
