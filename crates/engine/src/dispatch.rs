pub trait MainThreadDispatcher {
    fn dispatch(&self, action: impl FnOnce() + Send + 'static) -> Result<(), String>;
}
