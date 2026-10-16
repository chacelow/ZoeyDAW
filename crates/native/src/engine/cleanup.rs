use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet},
    sync::{Arc, Mutex},
};

use napi::{Env, Result};

pub(super) struct CleanupOwner {
    pub active: Mutex<BTreeSet<u32>>,
    #[cfg(feature = "verification")]
    _resource: super::verification::CleanupOwner,
}

thread_local! {
    static OWNERS: RefCell<BTreeMap<usize, Arc<CleanupOwner>>> = const { RefCell::new(BTreeMap::new()) };
}

pub(super) fn for_env(env: Env) -> Result<Arc<CleanupOwner>> {
    let key = env.raw() as usize;
    OWNERS.with(|owners| {
        let mut owners = owners.borrow_mut();
        if let Some(owner) = owners.get(&key) {
            return Ok(Arc::clone(owner));
        }
        let owner = Arc::new(CleanupOwner {
            active: Mutex::default(),
            #[cfg(feature = "verification")]
            _resource: super::verification::CleanupOwner::new(),
        });
        env.add_env_cleanup_hook((key, Arc::clone(&owner)), |(key, owner)| {
            OWNERS.with(|owners| owners.borrow_mut().remove(&key));
            let active = match owner.active.lock() {
                Ok(mut active) => std::mem::take(&mut *active),
                Err(_) => return,
            };
            for id in active {
                let _ = super::dispose(id);
            }
        })?;
        owners.insert(key, Arc::clone(&owner));
        Ok(owner)
    })
}
