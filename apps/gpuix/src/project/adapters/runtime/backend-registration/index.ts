import { createNativeBackend } from "../../backend/native"
import type { ProjectBackendFactory } from "../../../model/backend"

interface BackendRegistrationTarget {
  configureProjectBackend: (factory: ProjectBackendFactory) => () => void
}

export function registerNativeBackend(runtime: BackendRegistrationTarget): () => void {
  return runtime.configureProjectBackend(createNativeBackend)
}
