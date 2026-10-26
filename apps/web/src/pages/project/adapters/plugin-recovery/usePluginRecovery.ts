import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useProjectState } from "@/pages/project/stores/useProjectState"
import type { PluginFaultStatus } from "@/shared/native/plugins"
import { recoverPlugin, isPluginRecoveryPending, subscribePluginRecovery } from "./controller"

type RecoveryView =
  { phase: "idle" } | { phase: "failed"; epoch: string; target: string; message: string }

export function usePluginRecoveryPending(sessionId: string, deviceId: string): boolean {
  return useSyncExternalStore(subscribePluginRecovery, () =>
    isPluginRecoveryPending(sessionId, deviceId)
  )
}

export function usePluginRecovery(fault: PluginFaultStatus | undefined) {
  const epoch = useProjectState(state => state.session.editEpoch)
  const [view, setView] = useState<RecoveryView>({ phase: "idle" })
  const live = useRef(false)
  const attempt = useRef(0)
  const target = fault ? `${fault.sessionId}/${fault.deviceId}/${fault.instanceId}` : null
  const busy = usePluginRecoveryPending(fault?.sessionId ?? "", fault?.deviceId ?? "")
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  const current = (request: number) =>
    live.current &&
    attempt.current === request &&
    useProjectState.getState().session.editEpoch === epoch
  return {
    busy,
    error:
      view.phase === "failed" && view.epoch === epoch && view.target === target
        ? view.message
        : null,
    recover: async () => {
      if (!live.current || !fault || !target) return
      const request = ++attempt.current
      setView({ phase: "idle" })
      try {
        await recoverPlugin(fault)
        if (current(request)) setView({ phase: "idle" })
      } catch (error) {
        if (current(request)) setView({ phase: "failed", epoch, target, message: String(error) })
      }
    },
  }
}
