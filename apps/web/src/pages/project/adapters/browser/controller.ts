import { create } from "zustand"
import type { BrowserTreeRow, BrowserRoots, nativeBrowserCatalog } from "@/shared/native/browser"

export interface PreparedAudition {
  durationSeconds: number
}
export interface BrowserAuditionPort {
  select(path: string): Promise<PreparedAudition>
  stop(): void | Promise<void>
  seek(normalized: number): void | Promise<void>
  read(): Promise<{ positionSeconds: number; durationSeconds: number; playing: boolean }>
}
export type AuditionState =
  | { kind: "idle" }
  | { kind: "preparing"; itemId: string }
  | {
      kind: "ready"
      itemId: string
      positionSeconds: number
      durationSeconds: number
      playing: boolean
    }
  | { kind: "error"; itemId: string; error: string }
export interface BrowserLibraryState {
  roots: BrowserRoots["roots"]
  revision: number
  scope: string
  rootId: string | null
  query: string
  offset: number
  total: number
  items: BrowserTreeRow[]
  expanded: ReadonlySet<string>
  selection: Readonly<Record<string, BrowserTreeRow>>
  favorites: ReadonlyMap<string, BrowserTreeRow>
  queryState: "idle" | "loading" | "ready" | "error"
  error: string | null
  busy: boolean
  auditionEnabled: boolean
  audition: AuditionState
}
export const BROWSER_WINDOW_SIZE = 160
const audioScopes = new Set(["all", "samples", "sounds", "userLibrary", "packs"])
function message(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message
  return "operationFailed"
}
export function createBrowserLibrary(catalog: typeof nativeBrowserCatalog) {
  const useState = create<BrowserLibraryState>(() => ({
    roots: [],
    revision: 0,
    scope: "all",
    rootId: null,
    query: "",
    offset: 0,
    total: 0,
    items: [],
    expanded: new Set(),
    selection: {},
    favorites: new Map(),
    queryState: "idle",
    error: null,
    busy: false,
    auditionEnabled: true,
    audition: { kind: "idle" },
  }))
  let queryGeneration = 0
  let auditionGeneration = 0
  let auditionPort: BrowserAuditionPort | null = null
  let rootPoll: ReturnType<typeof setTimeout> | undefined
  let previewPoll: ReturnType<typeof setTimeout> | undefined
  let users = 0
  let lifecycle = 0

  async function stopAudition() {
    ++auditionGeneration
    clearTimeout(previewPoll)
    useState.setState({ audition: { kind: "idle" } })
    try {
      await auditionPort?.stop()
    } catch (error) {
      useState.setState({ error: message(error) })
    }
  }
  function pollPreview(generation: number, port: BrowserAuditionPort, itemId: string) {
    clearTimeout(previewPoll)
    previewPoll = setTimeout(async () => {
      try {
        const status = await port.read()
        if (generation !== auditionGeneration || port !== auditionPort) return
        useState.setState({ audition: { kind: "ready", itemId, ...status } })
        if (status.playing) pollPreview(generation, port, itemId)
      } catch (error) {
        if (generation === auditionGeneration)
          useState.setState({ audition: { kind: "error", itemId, error: message(error) } })
      }
    }, 33)
  }
  async function playSelected(normalized = 0) {
    const state = useState.getState()
    const item = state.selection[state.scope]
    if (!item || item.kind !== "audio") return
    const generation = ++auditionGeneration
    const port = auditionPort
    clearTimeout(previewPoll)
    if (!port) {
      useState.setState({
        audition: { kind: "error", itemId: item.id, error: "auditionUnavailable" },
      })
      return
    }
    useState.setState({ audition: { kind: "preparing", itemId: item.id } })
    try {
      const data = await port.select(item.path)
      if (generation !== auditionGeneration || port !== auditionPort) return
      if (normalized > 0) await port.seek(normalized)
      if (generation !== auditionGeneration || port !== auditionPort) return
      useState.setState({
        audition: {
          kind: "ready",
          itemId: item.id,
          durationSeconds: data.durationSeconds,
          positionSeconds: normalized * data.durationSeconds,
          playing: true,
        },
      })
      pollPreview(generation, port, item.id)
    } catch (error) {
      if (generation === auditionGeneration)
        useState.setState({ audition: { kind: "error", itemId: item.id, error: message(error) } })
    }
  }
  async function loadWindow(offset = 0) {
    const generation = ++queryGeneration
    const state = useState.getState()
    useState.setState({ queryState: "loading", error: null })
    if (state.scope === "favorites") {
      const words = state.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
      const matches = [...state.favorites.values()]
        .filter(item =>
          words.every(word =>
            `${item.name} ${item.relativePath}`.toLocaleLowerCase().includes(word)
          )
        )
        .sort((a, b) => a.name.localeCompare(b.name))
      useState.setState({
        items: matches.slice(offset, offset + BROWSER_WINDOW_SIZE),
        offset,
        total: matches.length,
        queryState: "ready",
      })
      return
    }
    if (!state.rootId && !audioScopes.has(state.scope)) {
      useState.setState({ items: [], total: 0, offset: 0, queryState: "ready" })
      return
    }
    if (!catalog.available()) {
      useState.setState({ queryState: "error", error: "nativeUnavailable" })
      return
    }
    const requestId = crypto.randomUUID()
    try {
      const result = await catalog.tree({
        rootId: state.rootId,
        query: state.query,
        expanded: [...state.expanded],
        offset,
        limit: BROWSER_WINDOW_SIZE,
        requestId,
      })
      if (generation !== queryGeneration || result.requestId !== requestId) return
      if (result.revision < useState.getState().revision) {
        void loadWindow(offset)
        return
      }
      if (result.total > 0 && offset >= result.total) {
        void loadWindow(Math.max(0, result.total - BROWSER_WINDOW_SIZE))
        return
      }
      useState.setState({
        items: result.items,
        total: result.total,
        offset: result.offset,
        revision: result.revision,
        queryState: "ready",
      })
    } catch (error) {
      if (generation === queryGeneration)
        useState.setState({ queryState: "error", error: message(error) })
    }
  }
  function acceptRoots(result: BrowserRoots) {
    const state = useState.getState()
    if (result.revision < state.revision) return
    useState.setState({ roots: result.roots, revision: result.revision })
    if (result.revision !== state.revision) void loadWindow(state.offset)
    scheduleRootPoll()
  }
  function scheduleRootPoll() {
    clearTimeout(rootPoll)
    if (!users || !useState.getState().roots.some(root => root.status === "scanning")) return
    const token = lifecycle
    rootPoll = setTimeout(async () => {
      try {
        const result = await catalog.roots()
        if (token === lifecycle && users) acceptRoots(result)
      } catch (error) {
        if (token === lifecycle && users) {
          useState.setState({ error: message(error) })
          scheduleRootPoll()
        }
      }
    }, 250)
  }
  async function refreshRoots() {
    if (!catalog.available()) {
      useState.setState({ error: "nativeUnavailable", queryState: "error" })
      return
    }
    const token = lifecycle
    try {
      const result = await catalog.roots()
      if (token === lifecycle) acceptRoots(result)
    } catch (error) {
      if (token === lifecycle) useState.setState({ error: message(error) })
    }
  }
  async function rootAction(action: () => Promise<BrowserRoots>) {
    if (useState.getState().busy) return
    useState.setState({ busy: true, error: null })
    try {
      acceptRoots(await action())
    } catch (error) {
      useState.setState({ error: message(error) })
    } finally {
      useState.setState({ busy: false })
    }
  }
  const library = {
    start() {
      ++users
      if (users === 1) {
        ++lifecycle
        void refreshRoots()
        void loadWindow()
      }
      return () => {
        users = Math.max(0, users - 1)
        if (!users) {
          ++lifecycle
          ++queryGeneration
          clearTimeout(rootPoll)
          void stopAudition()
        }
      }
    },
    loadWindow,
    refreshRoots,
    async addFolder() {
      if (!catalog.available()) {
        useState.setState({ error: "nativeUnavailable" })
        return
      }
      await rootAction(async () => {
        const path = await catalog.pickFolder()
        return typeof path === "string"
          ? catalog.addRoot(path, crypto.randomUUID())
          : { roots: useState.getState().roots, revision: useState.getState().revision }
      })
    },
    refreshRoot: (rootId: string) =>
      rootAction(() => catalog.refreshRoot(rootId, crypto.randomUUID())),
    async cancelScan(operationId: string) {
      try {
        await catalog.cancelScan(operationId)
        await refreshRoots()
      } catch (error) {
        useState.setState({ error: message(error) })
      }
    },
    removeRoot: (rootId: string) => rootAction(() => catalog.removeRoot(rootId)),
    setScope(scope: string, rootId: string | null = null) {
      void stopAudition()
      useState.setState({ scope, rootId, items: [], offset: 0, total: 0 })
      void loadWindow()
    },
    setQuery(query: string) {
      useState.setState({ query, offset: 0 })
      void loadWindow()
    },
    toggleFolder(item: BrowserTreeRow) {
      if (item.kind !== "folder") return
      const expanded = new Set(useState.getState().expanded)
      if (expanded.has(item.id)) expanded.delete(item.id)
      else expanded.add(item.id)
      useState.setState({ expanded })
      void loadWindow(useState.getState().offset)
    },
    select(item: BrowserTreeRow) {
      const state = useState.getState()
      useState.setState({ selection: { ...state.selection, [state.scope]: item } })
      if (item.kind === "audio" && state.auditionEnabled) void playSelected()
      else void stopAudition()
    },
    toggleFavorite(item: BrowserTreeRow) {
      if (item.kind !== "audio") return
      const favorites = new Map(useState.getState().favorites)
      if (favorites.has(item.id)) favorites.delete(item.id)
      else favorites.set(item.id, item)
      useState.setState({ favorites })
      if (useState.getState().scope === "favorites") void loadWindow()
    },
    setAuditionEnabled(auditionEnabled: boolean) {
      useState.setState({ auditionEnabled })
      if (auditionEnabled) void playSelected()
      else void stopAudition()
    },
    playSelected,
    stopAudition,
    async seek(normalized: number) {
      const value = Math.max(0, Math.min(1, normalized))
      const state = useState.getState(),
        item = state.selection[state.scope]
      if (!item || item.kind !== "audio") return
      if (
        state.audition.kind !== "ready" ||
        state.audition.itemId !== item.id ||
        !state.audition.playing
      ) {
        await playSelected(value)
        return
      }
      const port = auditionPort
      if (!port) return
      const generation = ++auditionGeneration
      clearTimeout(previewPoll)
      try {
        await port.seek(value)
        if (generation === auditionGeneration) pollPreview(generation, port, item.id)
      } catch (error) {
        if (generation === auditionGeneration) useState.setState({ error: message(error) })
      }
    },
    configureAudition(port: BrowserAuditionPort) {
      const previous = auditionPort
      void stopAudition()
      auditionPort = port
      return () => {
        if (auditionPort !== port) return
        void stopAudition()
        auditionPort = previous
      }
    },
  }
  return { library, useState }
}
