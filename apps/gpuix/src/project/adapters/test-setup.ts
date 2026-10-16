import { configureProjectBackend, configureProjectCreation } from "./context"
import { createMockProjectBackend } from "./backend/mock"
import { createMockDocument, createMockWorkspace, TEST_PROJECT_CREATION } from "./fixtures"
import { createMemorySnapshotStorage, setSnapshotStorage } from "./snapshots"

configureProjectCreation(TEST_PROJECT_CREATION)
configureProjectBackend(createMockProjectBackend, {
  createProject: () => ({ document: createMockDocument(), workspace: createMockWorkspace() }),
})
setSnapshotStorage(createMemorySnapshotStorage())
