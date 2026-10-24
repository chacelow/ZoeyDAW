import type { BackendSource, BackendDevice } from "@zoeydaw/project-core/backend"
import type { PluginStateRef } from "@zoeydaw/project-core/devices"

const locations = { resolve: (source: BackendSource): string => source.uri }
const pluginLocations = { resolve: (state: PluginStateRef): PluginStateRef => state }

export function configureBackendSourceLocations(
  resolve: (source: BackendSource) => string
): () => void {
  const previous = locations.resolve
  locations.resolve = resolve
  return () => {
    if (locations.resolve === resolve) locations.resolve = previous
  }
}

export function resolveBackendSources(sources: readonly BackendSource[]): BackendSource[] {
  return sources.map(source => ({ ...source, uri: locations.resolve(source) }))
}

export function configureBackendPluginLocations(
  resolve: (state: PluginStateRef) => PluginStateRef
): () => void {
  const previous = pluginLocations.resolve
  pluginLocations.resolve = resolve
  return () => {
    if (pluginLocations.resolve === resolve) pluginLocations.resolve = previous
  }
}

export function resolveBackendDevices(devices: readonly BackendDevice[]): BackendDevice[] {
  return devices.map(device =>
    device.kind === "external" && device.stateRef
      ? { ...device, stateRef: pluginLocations.resolve(device.stateRef) }
      : device
  )
}
