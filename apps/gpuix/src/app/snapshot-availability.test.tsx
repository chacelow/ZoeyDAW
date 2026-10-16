import { expect, test } from "bun:test"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import {
  canSaveSnapshot,
  configureProjectBackend,
  createMemorySnapshotStorage,
  openProjectSnapshot,
  projectActions,
  serializeProject,
  setProjectStorageId,
  setSnapshotStorage,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { createNativeBackend } from "@/project/adapters/backend/native"
import { NATIVE_MULTI_SESSION_TEST_TIMEOUT } from "@/app/verification/native-session-budget"

function SaveAvailability() {
  const allowed = useProjectState(canSaveSnapshot)
  return <div testId="save-availability">{String(allowed)}</div>
}

test(
  "save availability subscribes to failed open, Restore and project switching",
  async () => {
    const unregister = configureProjectBackend(createNativeBackend)
    const storage = createMemorySnapshotStorage()
    setSnapshotStorage(storage)
    setProjectStorageId("availability-seed")
    const valid = serializeProject()
    const ready = useProjectState.getState()
    const corruptKey = "zoeydaw:project:snapshot:v1:availability-corrupt"
    const damaged = "corrupt snapshot bytes"
    storage.set(corruptKey, damaged)
    const root = createTestRoot({ width: 1280, height: 800 })
    let release: (() => void) | null = null
    try {
      root.render(<SaveAvailability />)
      flushSync(() => openProjectSnapshot("availability-corrupt"))
      const failed = useProjectState.getState()
      release = startProjectRuntime()
      expect(await whenProjectBackendIdle()).toBe(true)
      root.renderer.flush()
      expect(root.renderer.getAllText()).toEqual(["false"])
      projectActions.saveSnapshot()
      expect(await whenProjectBackendIdle()).toBe(true)
      expect(storage.get(corruptKey)).toBe(damaged)
      // A selector must keep historical state readable after the live project changes.
      expect(canSaveSnapshot(ready)).toBe(true)
      storage.set(corruptKey, valid)
      flushSync(() => {
        expect(projectActions.restoreSnapshot()).toBe(true)
      })
      expect(await whenProjectBackendIdle()).toBe(true)
      root.renderer.flush()
      expect(root.renderer.getAllText()).toEqual(["true"])
      expect(canSaveSnapshot(failed)).toBe(false)
      flushSync(() => openProjectSnapshot("availability-next"))
      expect(await whenProjectBackendIdle()).toBe(true)
      root.renderer.flush()
      expect(root.renderer.getAllText()).toEqual(["true"])
      expect(useProjectState.getState().session.snapshotError).toBeNull()
    } finally {
      root.unmount()
      release?.()
      unregister()
      setSnapshotStorage(null)
    }
  },
  NATIVE_MULTI_SESSION_TEST_TIMEOUT
)
