import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest"
import { create } from "zustand"
import { createStore } from "zustand/vanilla"
import { initialSession, initialDocument, initialWorkspace } from "@zoeydaw/project-runtime/state"
import { createProjectRuntime } from "@zoeydaw/project-runtime"
import {
  createMockProjectBackend,
  createMockDocument,
  createMockWorkspace,
} from "@zoeydaw/project-runtime/testing"
import {
  configureProjectBackend,
  hydrateProject,
  projectActions,
  useProjectState,
  whenProjectBackendIdle,
  startProjectRuntime,
  setProjectStorageId,
} from "."
import type { BackendDocumentRequest } from "@zoeydaw/project-core/backend"
import type { ProjectState } from "@zoeydaw/project-core/types"
import { readProjectMeterLevels } from "./realtime"
import { deferredBackend } from "./runtime-test-backend"

const backendPhaseOnImport = useProjectState.getState().session.backend.phase

const fresh = () =>
  hydrateProject(
    JSON.stringify({
      version: 3,
      document: createMockDocument(DEFAULT_TRACK_HEIGHT),
      workspace: createMockWorkspace(),
    })
  )
let restore: (() => void) | null = null
let releaseRuntime: (() => void) | null = null
beforeEach(() => {
  configureProjectBackend(createMockProjectBackend)
  localStorage.clear()
  fresh()
  releaseRuntime = startProjectRuntime()
})
afterEach(() => {
  releaseRuntime?.()
  releaseRuntime = null
  restore?.()
  restore = null
})

it("does not create backend resources on import, factory construction, or hydration, and isolates runtime instances", () => {
  releaseRuntime?.()
  expect(backendPhaseOnImport).toBe("idle")
  releaseRuntime = null
  let opened = 0
  let disposed = 0
  const openedBpms: number[] = []
  const backendFactory = () => {
    opened++
    const backend = createMockProjectBackend()
    return {
      ...backend,
      apply(request: BackendDocumentRequest) {
        if (request.stage === "open") {
          openedBpms.push(request.state.project.bpm)
        }
        return backend.apply(request)
      },
      dispose() {
        backend.dispose()
        disposed++
      },
    }
  }
  const removeDefault = configureProjectBackend(backendFactory)
  fresh()
  expect(opened).toBe(0)
  removeDefault()
  const makeStore = () =>
    create<ProjectState>(() => ({
      document: initialDocument(DEFAULT_TRACK_HEIGHT),
      workspace: initialWorkspace(),
      session: initialSession(),
    }))
  const first = createProjectRuntime({
    store: makeStore(),
    backendFactory,
    defaultTrackHeight: DEFAULT_TRACK_HEIGHT,
  })
  const second = createProjectRuntime({
    store: makeStore(),
    backendFactory,
    defaultTrackHeight: DEFAULT_TRACK_HEIGHT,
  })
  expect(opened).toBe(0)
  first.hydrateState({
    document: createMockDocument(DEFAULT_TRACK_HEIGHT),
    workspace: createMockWorkspace(),
  })
  second.hydrateState({
    document: createMockDocument(DEFAULT_TRACK_HEIGHT),
    workspace: createMockWorkspace(),
  })
  first.document({ ...first.get().document, name: "First" })
  first.document({
    ...first.get().document,
    transport: { ...first.get().document.transport, bpm: 177 },
  })
  expect(second.get().document.name).not.toBe("First")
  expect(opened).toBe(0)
  const stopFirst = first.startProjectRuntime()
  expect(opened).toBe(1)
  const edit = first.beginEdit()
  first.document({ ...first.get().document, name: "Temporary" })
  const stopSecond = second.startProjectRuntime()
  expect(first.isCurrentEdit({ ...edit, sessionId: second.get().session.backend.sessionId })).toBe(
    false
  )
  expect(second.isCurrentEdit(edit)).toBe(false)
  expect(opened).toBe(2)
  expect(openedBpms).toEqual([177, second.get().document.transport.bpm])
  expect(second.get().session.preview).toBeNull()
  stopFirst()
  expect(disposed).toBe(1)
  expect(first.get().document.name).toBe("First")
  first.endEdit(edit)
  expect(first.get().document.name).toBe("First")
  expect(second.get().session.backend.phase).toBe("ready")
  stopSecond()
  expect(disposed).toBe(2)
})

it("disposes backend resources on the last page lease and reopens a fresh epoch", async () => {
  releaseRuntime?.()
  releaseRuntime = null
  const instances: { disposed: boolean; requests: BackendDocumentRequest[] }[] = []
  restore = configureProjectBackend(() => {
    const instance: { disposed: boolean; requests: BackendDocumentRequest[] } = {
      disposed: false,
      requests: [],
    }
    instances.push(instance)
    const backend = createMockProjectBackend()
    return {
      ...backend,
      apply(request) {
        instance.requests.push(request)
        return backend.apply(request)
      },
      dispose() {
        backend.dispose()
        instance.disposed = true
      },
    }
  })
  const releaseOne = startProjectRuntime()
  const firstEpoch = useProjectState.getState().session.backend.sessionId
  const releaseTwo = startProjectRuntime()
  releaseOne()
  expect(instances[0].disposed).toBe(false)
  releaseTwo()
  expect(instances[0].disposed).toBe(true)
  expect(useProjectState.getState().session.backend.phase).toBe("idle")
  const releaseNext = startProjectRuntime()
  expect(instances).toHaveLength(2)
  expect(useProjectState.getState().session.backend.sessionId).not.toBe(firstEpoch)
  projectActions.setBpm(153)
  expect(instances[1].requests.at(-1)?.state.project.bpm).toBe(153)
  releaseNext()
  expect(instances[1].disposed).toBe(true)
  expect(await whenProjectBackendIdle()).toBe(false)
})

it("does not let an older backend cleanup replace the current installation", async () => {
  const first = deferredBackend()
  const second = deferredBackend()
  const removeFirst = configureProjectBackend(() => first.backend)
  const removeSecond = configureProjectBackend(() => second.backend)
  restore = () => {
    removeSecond()
    removeFirst()
  }
  const epoch = useProjectState.getState().session.backend.sessionId
  removeFirst()
  expect(useProjectState.getState().session.backend.sessionId).toBe(epoch)
  projectActions.setBpm(155)
  expect(second.requests.at(-1)?.state.project.bpm).toBe(155)
  second.settle("accepted")
  await Promise.resolve()
  removeSecond()
  projectActions.setBpm(165)
  expect(useProjectState.getState().session.backend.pending).toBe(0)
  expect(useProjectState.getState().session.backend.error).toBeNull()
})

it("rejects edits visibly when the backend could not initialize instead of silently dropping them", async () => {
  restore = configureProjectBackend(() => {
    throw new Error("Unavailable backend")
  })
  expect(useProjectState.getState().session.backend.error).toBe("connection")
  projectActions.setBpm(185)
  expect(useProjectState.getState().document.transport.bpm).toBe(120)
  expect(useProjectState.getState().session.backend.pending).toBe(0)
  expect(useProjectState.getState().session.canUndo).toBe(false)
  expect(await whenProjectBackendIdle()).toBe(false)
})

it("opens external-backend projects without demo media and leaves empty audio clips silent", () => {
  restore = configureProjectBackend(createMockProjectBackend)
  setProjectStorageId("external-empty")
  expect(useProjectState.getState().document.tracks.map(track => track.kind)).toEqual([
    "audio",
    "main",
  ])
  const track = useProjectState.getState().document.tracks.find(track => track.kind === "audio")
  if (!track) {
    throw new Error("Missing audio track")
  }
  projectActions.createClip(track.id, "audio", 1, 4)
  const clip = useProjectState.getState().document.tracks.find(item => item.id === track.id)
    ?.clips[0]
  expect(clip).toMatchObject({ kind: "audio", sourceId: null })
  const stop = startProjectRuntime()
  try {
    projectActions.togglePlay()
    expect(readProjectMeterLevels({ kind: "track", trackId: track.id })).toEqual([
      -Infinity,
      -Infinity,
    ])
  } finally {
    stop()
  }
})

it("initializes each project from its backend registration and restores the previous initializer", () => {
  const removeFirst = configureProjectBackend(createMockProjectBackend, {
    createProject: projectId => ({
      document: { ...initialDocument(DEFAULT_TRACK_HEIGHT), name: projectId },
      workspace: initialWorkspace(),
    }),
  })
  const removeSecond = configureProjectBackend(createMockProjectBackend)
  restore = () => {
    removeSecond()
    removeFirst()
  }
  setProjectStorageId("external-second")
  expect(useProjectState.getState().document.name).toBe(initialDocument(DEFAULT_TRACK_HEIGHT).name)
  removeSecond()
  setProjectStorageId("external-first")
  expect(useProjectState.getState().document.name).toBe("external-first")
  expect(useProjectState.getState().session.canUndo).toBe(false)
})

it("starts independently injected runtime projects without fabricated demo media", () => {
  const store = createStore<ProjectState>(() => ({
    document: initialDocument(DEFAULT_TRACK_HEIGHT),
    workspace: initialWorkspace(),
    session: initialSession(),
  }))
  const runtime = createProjectRuntime({
    store,
    backendFactory: createMockProjectBackend,
    defaultTrackHeight: DEFAULT_TRACK_HEIGHT,
  })
  runtime.resetProject("native-bootstrap")
  expect(runtime.get().document.tracks.map(track => track.kind)).toEqual(["audio", "main"])
  expect(runtime.get().document.tracks[0]).toMatchObject({
    name: "1 Audio",
    output: "main",
    volumeDb: 0,
    pan: 0,
    armed: false,
  })
  expect(runtime.get().document.media).toEqual([])
  expect(runtime.get().document.tracks.flatMap(track => track.clips)).toEqual([])
  expect(runtime.get().session.backend.phase).toBe("idle")
  const before = runtime.get()
  const buses = before.document.tracks.filter(track => track.kind === "main")
  runtime.tracks(buses)
  runtime.document({ ...before.document, tracks: buses })
  expect(runtime.get()).toBe(before)
  const token = runtime.beginPreview()
  expect(runtime.previewTracks(token, buses)).toBeNull()
  expect(runtime.getEffectiveDocument()).toBe(before.document)
  runtime.cancelPreview(token)
  expect(runtime.get().session.canUndo).toBe(false)
})

it("normalizes custom reset and hydration seeds before backend opening, without mutating the seed", async () => {
  const document = initialDocument(DEFAULT_TRACK_HEIGHT)
  document.tracks = document.tracks.filter(track => track.kind === "main")
  document.name = "Legacy project"
  const seed = { document, workspace: initialWorkspace() }
  const store = createStore<ProjectState>(() => ({ ...seed, session: initialSession() }))
  const requests: BackendDocumentRequest[] = []
  const runtime = createProjectRuntime({
    store,
    defaultTrackHeight: DEFAULT_TRACK_HEIGHT,
    createProject: () => seed,
    backendFactory: () => {
      const backend = createMockProjectBackend()
      return {
        ...backend,
        apply(request) {
          requests.push(request)
          return backend.apply(request)
        },
      }
    },
  })
  runtime.resetProject("legacy-reset")
  expect(runtime.get().document.tracks.map(track => track.kind)).toEqual(["audio", "main"])
  runtime.hydrateState(seed)
  expect(runtime.get().document.tracks.map(track => track.kind)).toEqual(["audio", "main"])
  const release = runtime.startProjectRuntime()
  try {
    await runtime.whenProjectBackendIdle()
    expect(requests[0].state.project.tracks.map(track => track.kind)).toEqual(["audio", "main"])
    await runtime.replaceProject(seed, new AbortController().signal)
    expect(requests.at(-1)?.state.project.tracks.map(track => track.kind)).toEqual([
      "audio",
      "main",
    ])
    expect(runtime.get().document.name).toBe("Legacy project")
    expect(document.tracks.map(track => track.kind)).toEqual(["main"])
    expect(runtime.get().document.tracks[0].clips).toEqual([])
  } finally {
    release()
  }
})
