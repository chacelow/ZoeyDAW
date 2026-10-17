import { expect, test } from "bun:test"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import {
  canSaveProjectFile,
  configureProjectBackend,
  createMemoryProjectFiles,
  openProjectFile,
  projectActions,
  serializeProject,
  openNewProject,
  setProjectFiles,
  startProjectRuntime,
  useProjectState,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { createNativeBackend } from "@/project/adapters/backend/native"
import { NATIVE_MULTI_SESSION_TEST_TIMEOUT } from "@/app/verification/native-session-budget"

function SaveAvailability() {
  const allowed = useProjectState(canSaveProjectFile)
  return <div testId="save-availability">{String(allowed)}</div>
}

test(
  "save availability follows a damaged open, Save As recovery and project switching",
  async () => {
    const unregister = configureProjectBackend(createNativeBackend)
    const files = createMemoryProjectFiles()
    setProjectFiles(files)
    openNewProject("availability-seed")
    const valid = serializeProject()
    const damagedPath = "/projects/Damaged Project/Damaged.zdaw"
    const copyPath = "/projects/Copy Project/Copy.zdaw"
    const damaged = "corrupt project bytes"
    files.entries.set(damagedPath, damaged)
    files.entries.set("/projects/Next Project/Next.zdaw", valid)
    const root = createTestRoot({ width: 1280, height: 800 })
    let release: (() => void) | null = null
    try {
      root.render(<SaveAvailability />)
      flushSync(() => openProjectFile(damagedPath))
      release = startProjectRuntime()
      expect(await whenProjectBackendIdle()).toBe(true)
      root.renderer.flush()
      expect(root.renderer.getAllText()).toEqual(["false"])
      projectActions.save()
      expect(await whenProjectBackendIdle()).toBe(true)
      expect(files.entries.get(damagedPath)).toBe(damaged)
      flushSync(() => projectActions.saveAs(copyPath))
      expect(await whenProjectBackendIdle()).toBe(true)
      root.renderer.flush()
      expect(root.renderer.getAllText()).toEqual(["true"])
      expect(files.entries.has(copyPath)).toBe(true)
      flushSync(() => openProjectFile("/projects/Next Project/Next.zdaw"))
      expect(await whenProjectBackendIdle()).toBe(true)
      root.renderer.flush()
      expect(root.renderer.getAllText()).toEqual(["true"])
      expect(useProjectState.getState().session.fileError).toBeNull()
    } finally {
      root.unmount()
      release?.()
      unregister()
      setProjectFiles(null)
    }
  },
  NATIVE_MULTI_SESSION_TEST_TIMEOUT
)
