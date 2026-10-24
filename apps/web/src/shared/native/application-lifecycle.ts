import { invoke, isTauri } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { z } from "zod"

export interface ApplicationCloseRequest {
  requestId: string
  intent: "close-button" | "explicit-exit"
}
export type ApplicationCloseResolution = "cancel" | "hide" | "exit"
export interface ApplicationClosePort {
  available: () => boolean
  requestClose: () => Promise<void>
  pending: () => Promise<ApplicationCloseRequest | null>
  subscribe: (
    listener: (request: ApplicationCloseRequest) => void,
    onError: (error: unknown) => void
  ) => () => void
  resolve: (requestId: string, action: ApplicationCloseResolution) => Promise<boolean>
}
const closeRequestSchema = z.object({
  requestId: z.string().min(1),
  intent: z.enum(["close-button", "explicit-exit"]),
})

export const nativeApplicationLifecycle: ApplicationClosePort = {
  available: isTauri,
  requestClose: () => invoke("request_app_close"),
  async pending() {
    const pending: unknown = await invoke("get_pending_app_close")
    return pending === null ? null : closeRequestSchema.parse(pending)
  },
  subscribe(listener, onError) {
    let disposed = false
    let unlisten: (() => void) | null = null
    let generation = 0
    void listen<unknown>("application-close-requested", event => {
      if (disposed) return
      generation++
      const parsed = closeRequestSchema.safeParse(event.payload)
      if (parsed.success) listener(parsed.data)
      else onError(parsed.error)
    })
      .then(async stop => {
        if (disposed) {
          stop()
          return
        }
        unlisten = stop
        const observedGeneration = generation
        const pending = await nativeApplicationLifecycle.pending()
        if (!disposed && generation === observedGeneration && pending) listener(pending)
      })
      .catch(error => {
        if (!disposed) onError(error)
      })
    return () => {
      disposed = true
      unlisten?.()
    }
  },
  async resolve(requestId, action) {
    const accepted: unknown = await invoke("resolve_app_close", { requestId, action })
    return z.boolean().parse(accepted)
  },
}
