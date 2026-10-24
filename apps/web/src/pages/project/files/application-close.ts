import { closeButtonAction } from "@/shared/native/close-behavior"
import type { CloseBehavior } from "@/shared/native/close-behavior"
import type {
  ApplicationClosePort,
  ApplicationCloseRequest,
  ApplicationCloseResolution,
} from "@/shared/native/application-lifecycle"

export type CloseChoice = "hide" | "quit" | "cancel"
interface ApplicationCloseDependencies {
  native: Pick<ApplicationClosePort, "resolve" | "pending">
  behavior: () => CloseBehavior
  isBusy: () => boolean
  confirmDiscard: () => Promise<boolean>
  cancelDiscard: () => void
  chooseClose: () => Promise<CloseChoice>
  resolveChoice: (choice: CloseChoice) => void
  onError: (error: unknown) => void
}
interface CloseControllerState {
  phase: "idle" | "processing" | "disposed"
  latest: ApplicationCloseRequest | null
  generation: number
  discard: { cancel: () => void } | null
}

export function createApplicationCloseController(dependencies: ApplicationCloseDependencies) {
  const state: CloseControllerState = {
    phase: "idle",
    latest: null,
    generation: 0,
    discard: null,
  }
  function isDisposed(): boolean {
    return state.phase === "disposed"
  }
  function acquireDiscard(): () => void {
    const lease = { cancel: dependencies.cancelDiscard }
    state.discard = lease
    return () => {
      if (state.discard === lease) state.discard = null
    }
  }

  function adoptPending(
    pending: ApplicationCloseRequest | null,
    generation: number,
    resolvingId: string
  ): void {
    if (
      !isDisposed() &&
      state.generation === generation &&
      pending &&
      pending.requestId !== resolvingId
    ) {
      void receive(pending)
    }
  }
  function finishRun(resolvingId: string): void {
    const next = state.latest
    state.latest = null
    if (isDisposed()) return
    state.phase = "idle"
    if (next && next.requestId !== resolvingId) void receive(next)
  }

  async function receive(request: ApplicationCloseRequest): Promise<void> {
    if (isDisposed()) return
    state.latest = request
    state.generation++
    if (state.phase === "processing") {
      if (request.intent === "explicit-exit") dependencies.resolveChoice("quit")
      return
    }
    state.phase = "processing"
    dependencies.onError(null)
    let resolvingId = request.requestId
    async function resolve(action: ApplicationCloseResolution): Promise<void> {
      const current = state.latest
      if (isDisposed() || !current) return
      resolvingId = current.requestId
      const generation = state.generation
      const accepted = await dependencies.native.resolve(resolvingId, action)
      if (!accepted) adoptPending(await dependencies.native.pending(), generation, resolvingId)
    }
    try {
      let action: CloseChoice = "quit"
      if (request.intent === "close-button") {
        const policy = closeButtonAction(dependencies.behavior())
        action =
          policy === "ask"
            ? await dependencies.chooseClose()
            : policy === "hide-to-tray"
              ? "hide"
              : "quit"
      }
      if (isDisposed()) return
      if (state.latest?.intent === "explicit-exit") action = "quit"
      if (action === "cancel") {
        await resolve("cancel")
      } else if (action === "hide") {
        await resolve("hide")
      } else if (dependencies.isBusy()) {
        dependencies.onError("fileOperationBusy")
        await resolve("cancel")
      } else {
        let discard: boolean
        const releaseDiscard = acquireDiscard()
        try {
          discard = await dependencies.confirmDiscard()
        } finally {
          releaseDiscard()
        }
        if (isDisposed()) return
        if (discard && dependencies.isBusy()) {
          dependencies.onError("fileOperationBusy")
          await resolve("cancel")
        } else {
          await resolve(discard ? "exit" : "cancel")
        }
      }
    } catch (error) {
      if (!isDisposed()) {
        dependencies.onError(error)
        try {
          await resolve("cancel")
        } catch (cancelError) {
          dependencies.onError(cancelError)
        }
      }
    } finally {
      finishRun(resolvingId)
    }
  }

  return {
    receive,
    dispose(): void {
      state.phase = "disposed"
      const discard = state.discard
      state.discard = null
      discard?.cancel()
      dependencies.resolveChoice("cancel")
    },
  }
}
