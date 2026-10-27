import type { ProjectRuntimeDependencies, ProjectSaveCapture } from "./runtime-contracts"

export function waitForSave({
  store,
  capture,
  signal,
  current,
}: {
  store: ProjectRuntimeDependencies["store"]
  capture: ProjectSaveCapture
  signal: AbortSignal
  current: () => { epoch: string; rejectionGeneration: number; recovered: boolean }
}): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<undefined>()
  let unsubscribe = () => {}
  function finish(error?: Error) {
    unsubscribe()
    signal.removeEventListener("abort", abort)
    if (error) reject(error)
    else resolve(undefined)
  }
  function abort() {
    finish(new DOMException("Cancelled", "AbortError"))
  }
  const check = () => {
    const backend = store.getState().session.backend
    const state = current()
    if (signal.aborted) return abort()
    if (capture.epoch !== state.epoch || capture.rejectionGeneration !== state.rejectionGeneration)
      return finish(new Error("Project changed or its backend rejected the saved revision"))
    if (state.recovered && backend.acceptedRevision >= capture.revision) return finish()
    if (backend.phase === "error" && backend.pending === 0)
      finish(new Error(backend.error ?? "Project backend is unavailable"))
  }
  unsubscribe = store.subscribe(check)
  signal.addEventListener("abort", abort, { once: true })
  check()
  return promise
}
