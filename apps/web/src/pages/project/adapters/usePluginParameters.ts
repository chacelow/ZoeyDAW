import { useEffect, useState, useSyncExternalStore } from "react"
import { nativePlugins } from "@/shared/native/plugins"
import type { PluginParameter } from "@/shared/native/plugins"
import type { ExternalDevice } from "@zoeydaw/project-core/devices"
import { readNativePluginFaults, subscribeNativeAudioStatus } from "@/shared/native/audio"
import { useProjectState } from "@/pages/project/stores/useProjectState"
import { usePluginRecoveryPending } from "./plugin-recovery"

const EMPTY_PARAMETERS: PluginParameter[] = []
type Metadata = { key: string; parameters: PluginParameter[]; error: string | null }

export function usePluginParameters(device: ExternalDevice | undefined, enabled = true) {
  const sessionId = useProjectState(state => state.session.backend.sessionId)
  const epoch = useProjectState(state => state.session.editEpoch)
  const phase = useProjectState(state => state.session.backend.phase)
  const deviceId = device?.id
  const catalogId = device?.plugin.catalogId
  const stateHash = device?.stateRef?.sha256
  const key = JSON.stringify([epoch, sessionId, deviceId, catalogId, stateHash])
  const faults = useSyncExternalStore(subscribeNativeAudioStatus, readNativePluginFaults)
  const fault = faults.find(fault => fault.sessionId === sessionId && fault.deviceId === deviceId)
  const recovering = usePluginRecoveryPending(sessionId, deviceId ?? "")
  const [metadata, setMetadata] = useState<Metadata | null>(null)
  useEffect(() => {
    if (
      !deviceId ||
      !enabled ||
      !nativePlugins.available() ||
      phase !== "ready" ||
      fault ||
      recovering
    )
      return
    let disposed = false
    void nativePlugins
      .parameters(sessionId, deviceId)
      .then(parameters => {
        if (!disposed) setMetadata({ key, parameters, error: null })
      })
      .catch(error => {
        if (!disposed)
          setMetadata(current => ({
            key,
            parameters: current?.key === key ? current.parameters : EMPTY_PARAMETERS,
            error: String(error),
          }))
      })
    return () => {
      disposed = true
    }
  }, [sessionId, deviceId, key, enabled, phase, fault, recovering])
  return metadata?.key === key ? metadata : { parameters: EMPTY_PARAMETERS, error: null }
}
