import { configureProjectBackend } from "./context"
import { createMockProjectBackend } from "./backend/mock"
import { createMockDocument, createMockWorkspace } from "./fixtures"
import { createMemorySnapshotStorage, setSnapshotStorage } from "./snapshots"

configureProjectBackend(createMockProjectBackend, {
  createProject: () => ({ document: createMockDocument(), workspace: createMockWorkspace() }),
})
setSnapshotStorage(createMemorySnapshotStorage())
