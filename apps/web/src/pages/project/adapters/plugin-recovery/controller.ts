import { nativePlugins } from "@/shared/native/plugins"
import type { PluginFaultStatus } from "@/shared/native/plugins"
import { publishNativeAudioStatus, readNativeAudioStatus } from "@/shared/native/audio"
import { useProjectState } from "@/pages/project/stores/useProjectState"
import { whenProjectBackendIdle } from "../context"
import { cancelPluginEditor } from "../plugin-editor"
import { useProjectFilesState } from "../project-files"

const pending = new Map<string, { instanceId: string; operation: Promise<void> }>()
const listeners = new Set<() => void>()
export function subscribePluginRecovery(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function isPluginRecoveryPending(sessionId: string, deviceId: string): boolean {
  return pending.has(`${sessionId}/${deviceId}`)
}
function notify() {
  for (const listener of listeners) listener()
}

export function recoverPlugin(fault: PluginFaultStatus): Promise<void> {
  const key = `${fault.sessionId}/${fault.deviceId}`
  const existing = pending.get(key)
  if (existing)
    return existing.instanceId === fault.instanceId
      ? existing.operation
      : Promise.reject(new Error("Plugin recovery is already in progress"))
  const operation = recover(fault).finally(() => {
    if (pending.get(key)?.operation === operation) {
      pending.delete(key)
      notify()
    }
  })
  pending.set(key, { instanceId: fault.instanceId, operation })
  notify()
  return operation
}

async function recover(fault: PluginFaultStatus): Promise<void> {
  const before = useProjectState.getState()
  const epoch = before.session.editEpoch
  const device = before.document.tracks
    .flatMap(track => track.devices ?? [])
    .find(device => device.id === fault.deviceId)
  if (!fault.recoverable) throw new Error("Plugin fault requires reprepare")
  if (before.session.backend.sessionId !== fault.sessionId || device?.kind !== "external")
    throw new Error("Stale plugin recovery owner")
  if (useProjectFilesState.getState().operation.kind !== "idle")
    throw new Error("Project file operation is in progress")
  const ownsDevice = () => {
    const state = useProjectState.getState()
    const current = state.document.tracks
      .flatMap(track => track.devices ?? [])
      .find(item => item.id === fault.deviceId)
    return (
      state.session.editEpoch === epoch &&
      state.session.backend.sessionId === fault.sessionId &&
      current?.kind === "external" &&
      current.plugin.catalogId === device.plugin.catalogId
    )
  }
  await cancelPluginEditor(fault.deviceId)
  await whenProjectBackendIdle()
  if (!ownsDevice()) throw new Error("Plugin recovery owner changed")
  const result = await nativePlugins.recover(fault.sessionId, fault.deviceId, fault.instanceId)
  if (!ownsDevice()) throw new Error("Plugin recovery owner changed")
  if (result.fault) throw new Error(result.fault.message)
  publishNativeAudioStatus({
    pluginFaults: readNativeAudioStatus().pluginFaults.filter(
      current =>
        current.sessionId !== fault.sessionId ||
        current.deviceId !== fault.deviceId ||
        current.instanceId !== fault.instanceId
    ),
  })
}
