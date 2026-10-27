use super::*;
use zoeydaw_plugin_host::PluginCatalog;

#[test]
#[ignore = "requires the bundled helper and user-authorized plugin catalog"]
fn real_instrument_seed_ownership() {
    let helper = PathBuf::from(std::env::var("ZOEYDAW_PROBE_HELPER").unwrap());
    let cache = PathBuf::from(std::env::var("ZOEYDAW_PROBE_CATALOG").unwrap());
    let catalog = PluginCatalog::new(helper, cache).unwrap();
    let entry = catalog
        .entries()
        .into_iter()
        .find(|entry| entry.plugin.name == "Vital" && format!("{:?}", entry.plugin.format) == "Clap")
        .unwrap();
    let device = PreparedDevice::prepare(catalog.select(&entry.catalog_id).unwrap(), 48000.0, 480, None).unwrap();
    let instance = device.control.instance_id();
    let registry = PluginDevices::default();
    {
        let mut state = registry.0.lock().unwrap();
        state.owners.insert("lease".into(), "window".into());
        state.sessions.insert("lease".into(), "session".into());
    }
    let id = "11111111-1111-4111-8111-111111111111";
    registry.store_seed("window", "session", id, entry.catalog_id.clone(), "hash".into(), device).unwrap();
    assert!(registry.take_seed("foreign", "session", id, &entry.catalog_id, Some("hash"), 48000.0, 480).is_none());
    let start = std::time::Instant::now();
    let restored = registry.take_seed("window", "session", id, &entry.catalog_id, Some("hash"), 48000.0, 480).unwrap();
    println!("seed adoption_us={}", start.elapsed().as_micros());
    assert_eq!(restored.control.instance_id(), instance);
    assert!(registry.take_seed("window", "session", id, &entry.catalog_id, Some("hash"), 48000.0, 480).is_none());
    let fresh = PreparedDevice::prepare(catalog.select(&entry.catalog_id).unwrap(), 48000.0, 480, None).unwrap();
    registry.store_seed("window", "session", id, entry.catalog_id.clone(), "hash".into(), fresh).unwrap();
    assert!(registry.take_seed("window", "session", id, &entry.catalog_id, Some("hash"), 44100.0, 480).is_none());
    let pending = PreparedDevice::prepare(catalog.select(&entry.catalog_id).unwrap(), 48000.0, 480, None).unwrap();
    registry.store_seed("window", "session", id, entry.catalog_id.clone(), "hash".into(), pending).unwrap();
    registry.close_lease("lease");
    assert!(registry.take_seed("window", "session", id, &entry.catalog_id, Some("hash"), 48000.0, 480).is_none());
}
