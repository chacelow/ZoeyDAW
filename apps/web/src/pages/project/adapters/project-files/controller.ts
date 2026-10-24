import { create } from "zustand"
import { z } from "zod"
import { createClip, createTrack, uniqueId } from "@zoeydaw/project-core/reducers"
import { insertClips } from "@zoeydaw/project-core/clip-edits"
import { DEFAULT_TRACK_HEIGHT } from "@/pages/project/layout"
import { defaultAudioClipSettings } from "@zoeydaw/project-core/audio-editor"
import { canAcceptAudioDrop } from "@zoeydaw/project-core/audio-drop"
import type { Track } from "@zoeydaw/project-core/types"
import { withWaveformPreview } from "@zoeydaw/project-runtime/visuals"
import { createManifest, parseExternalMedia, parseOpenedProject, parseSavedProject } from "./format"
import { readRecentProjects, rememberProject } from "./recent"
import type { BackendSource } from "@zoeydaw/project-core/backend"
import type { MediaSource } from "@zoeydaw/project-core/media"
import type { MediaIssue, ProjectManifest } from "./format"
import type { RecentProject } from "./recent"
import type { nativeProjectStorage } from "@/shared/native/project-storage"
import type * as context from "../context"
import { browserLibrary } from "../browser"
import { positionAtBar } from "../transport"
import type { AudioImportPreferences } from "@/shared/app-shared/audio-import-preferences"
import type { Device, PluginStateRef } from "@zoeydaw/project-core/devices"

type FileAction = "open" | "save" | "saveAs" | "collect" | "import" | "relink"
export interface ImportAudioPlacement {
  path: string
  trackId?: string
  startBar: number
}
export interface ProjectFileBinding {
  projectId: string
  path: string
  commitId: string
}
export interface ProjectFileState {
  binding: ProjectFileBinding | null
  operation:
    | { kind: "idle" }
    | {
        kind: "busy"
        action: FileAction
        stage: "picker" | "waiting" | "reading" | "writing" | "cancelling"
      }
  issues: MediaIssue[]
  error: string | null
  notice: "saved" | "collected" | "imported" | "tempoUnknown" | "cancelled" | "syncUncertain" | null
  confirmDiscard: boolean
  recent: RecentProject[]
}
type FileRuntime = Pick<
  typeof context,
  | "get"
  | "startProjectRuntime"
  | "captureProjectSave"
  | "waitForProjectSave"
  | "completeProjectSave"
  | "replaceProject"
  | "projectEpoch"
  | "document"
  | "getCommittedDocument"
  | "session"
>
interface BindingSource {
  captured: MediaSource
  stored: MediaSource
  path: string
}
const nativeError = z.object({ code: z.string(), message: z.string().optional() })

export function createProjectFileController(
  runtime: FileRuntime,
  storage: typeof nativeProjectStorage,
  adoptRoute: (id: string) => void,
  analyzeTempo: (path: string) => Promise<{ bpm: number | null }>,
  getImportPreferences: () => Readonly<AudioImportPreferences>
) {
  const useState = create<ProjectFileState>(() => ({
    binding: null,
    operation: { kind: "idle" },
    issues: [],
    error: null,
    notice: null,
    confirmDiscard: false,
    recent: readRecentProjects(),
  }))
  let active: { id: string; abort: AbortController } | null = null
  let confirm: ((decision: "save" | "discard" | "cancel") => void) | null = null
  let sourceBindings: BindingSource[] = []
  const pluginStateBindings = new Map<string, PluginStateRef>()
  let untitledId: string = crypto.randomUUID()

  async function confirmDiscard(): Promise<boolean> {
    if (confirm) return false
    if (!runtime.get().session.dirty) return true
    const decision = await new Promise<"save" | "discard" | "cancel">(resolve => {
      confirm = resolve
      useState.setState({ confirmDiscard: true })
    })
    if (decision === "discard") return true
    if (decision === "cancel") return false
    const pending = active
    const saved = pending
      ? await persist("save", { id: pending.id, signal: pending.abort.signal })
      : await save()
    return saved !== null && !runtime.get().session.dirty
  }
  function resolveDiscard(decision: "save" | "discard" | "cancel"): void {
    const resolve = confirm
    confirm = null
    useState.setState({ confirmDiscard: false })
    resolve?.(decision)
  }
  async function run<T>(
    action: FileAction,
    execute: (operation: { id: string; signal: AbortSignal }) => Promise<T>
  ): Promise<T | null> {
    if (active || confirm) return null
    if (!storage.available()) {
      useState.setState({ error: "nativeUnavailable", notice: null })
      return null
    }
    const operation = { id: crypto.randomUUID(), abort: new AbortController() }
    active = operation
    useState.setState({
      operation: { kind: "busy", action, stage: "picker" },
      error: null,
      notice: null,
    })
    try {
      return await execute({ id: operation.id, signal: operation.abort.signal })
    } catch (error) {
      const parsed = nativeError.safeParse(error)
      const failure = parsed.success ? parsed.data : null
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        failure?.code === "cancelled"
      ) {
        useState.setState({ notice: "cancelled" })
      } else {
        useState.setState({
          error: error instanceof Error ? error.message : (failure?.message ?? String(error)),
        })
      }
      return null
    } finally {
      if (active === operation) {
        active = null
        useState.setState({ operation: { kind: "idle" } })
      }
      resolveDiscard("cancel")
    }
  }
  function stage(value: "waiting" | "reading" | "writing"): void {
    const operation = useState.getState().operation
    if (operation.kind === "busy") useState.setState({ operation: { ...operation, stage: value } })
  }
  function cancelled(signal: AbortSignal): void {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError")
  }
  function remember(manifest: ProjectManifest, path: string): void {
    useState.setState({
      recent: rememberProject({
        id: manifest.projectId,
        name: manifest.project.document.name,
        path,
      }),
    })
  }
  function resolvedSource(source: MediaSource, path: string): MediaSource {
    if (source.location.kind !== "project") return source
    const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
    return {
      ...source,
      location: {
        kind: "external",
        path: `${path.slice(0, separator + 1)}${source.location.path}`,
      },
    }
  }
  function sourceForSave(source: MediaSource): MediaSource {
    const binding = sourceBindings.find(
      item =>
        item.captured.id === source.id &&
        item.captured.sha256 === source.sha256 &&
        JSON.stringify(item.captured.location) === JSON.stringify(source.location)
    )
    return binding
      ? { ...source, location: resolvedSource(binding.stored, binding.path).location }
      : source
  }

  function deviceForSave(device: Device): Device {
    if (device.kind !== "external" || !device.stateRef) return device
    const stored = pluginStateBindings.get(device.stateRef.sha256)
    return stored ? { ...device, stateRef: stored } : device
  }

  function open(path?: string): Promise<string | null> {
    return run("open", async ({ signal }) => {
      const selected = path ?? (await storage.pickProject())
      if (!selected) return null
      cancelled(signal)
      stage("reading")
      const opened = parseOpenedProject(await storage.openProject(selected))
      cancelled(signal)
      if (!(await confirmDiscard())) return null
      cancelled(signal)
      stage("waiting")
      await runtime.replaceProject(
        {
          ...opened.manifest.project,
          document: {
            ...opened.manifest.project.document,
            tracks: opened.manifest.project.document.tracks.map(track => ({
              ...track,
              clips: track.clips.map(clip =>
                clip.kind === "audio"
                  ? withWaveformPreview(clip, opened.manifest.project.document.media)
                  : clip
              ),
            })),
          },
        },
        signal
      )
      adoptRoute(opened.manifest.projectId)
      pluginStateBindings.clear()
      sourceBindings = opened.manifest.project.document.media.map(source => ({
        captured: source,
        stored: source,
        path: opened.path,
      }))
      useState.setState({
        binding: {
          projectId: opened.manifest.projectId,
          path: opened.path,
          commitId: opened.manifest.commitId,
        },
        issues: opened.issues,
      })
      remember(opened.manifest, opened.path)
      return opened.manifest.projectId
    })
  }

  function save(action: "save" | "saveAs" | "collect" = "save"): Promise<string | null> {
    return run(action, operation => persist(action, operation))
  }
  async function persist(
    action: "save" | "saveAs" | "collect",
    { id, signal }: { id: string; signal: AbortSignal }
  ): Promise<string | null> {
    const binding = useState.getState().binding
    const selected =
      action === "saveAs" || !binding
        ? await storage.pickSavePath(binding?.path ?? `${runtime.get().document.name}.zdaw`)
        : binding.path
    if (!selected) return null
    cancelled(signal)
    const release = runtime.startProjectRuntime()
    try {
      const capture = runtime.captureProjectSave()
      const projectId = binding?.projectId ?? untitledId
      const manifest = createManifest(
        projectId,
        {
          ...capture.document,
          media: capture.document.media.map(sourceForSave),
          tracks: capture.document.tracks.map(track => ({
            ...track,
            ...(track.devices ? { devices: track.devices.map(deviceForSave) } : {}),
          })),
        },
        capture.workspace
      )
      stage("waiting")
      await runtime.waitForProjectSave(capture, signal)
      cancelled(signal)
      stage("writing")
      const saved = parseSavedProject(
        await storage.saveProject({
          path: selected,
          manifest,
          collect: action !== "save",
          expectedCommitId: binding?.path === selected ? binding.commitId : null,
          operationId: id,
        })
      )
      if (runtime.projectEpoch() !== capture.epoch) return null
      if (saved.manifest.commitId !== manifest.commitId || saved.manifest.projectId !== projectId) {
        throw new Error("Project save receipt does not match this operation")
      }
      const savedBindings = capture.document.media.map(source => {
        const stored = saved.manifest.project.document.media.find(item => item.id === source.id)
        if (!stored || stored.sha256 !== source.sha256 || stored.byteLength !== source.byteLength) {
          throw new Error("Saved media registry does not match the captured project")
        }
        return { captured: source, stored, path: saved.path }
      })
      for (const track of capture.document.tracks)
        for (const device of track.devices ?? []) {
          if (device.kind !== "external" || !device.stateRef) continue
          const stored = saved.manifest.project.document.tracks
            .flatMap(item => item.devices ?? [])
            .find(item => item.id === device.id)
          if (stored?.kind !== "external" || stored.stateRef?.sha256 !== device.stateRef.sha256) {
            throw new Error("Saved plugin state does not match the captured project")
          }
          const separator = Math.max(saved.path.lastIndexOf("/"), saved.path.lastIndexOf("\\"))
          const path = stored.stateRef.path
          pluginStateBindings.set(device.stateRef.sha256, {
            ...stored.stateRef,
            path: /^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(path)
              ? path
              : `${saved.path.slice(0, separator + 1)}${path}`,
          })
        }
      sourceBindings = [
        ...savedBindings,
        ...sourceBindings.filter(
          prior =>
            !savedBindings.some(
              next =>
                next.captured.id === prior.captured.id &&
                next.captured.sha256 === prior.captured.sha256 &&
                JSON.stringify(next.captured.location) === JSON.stringify(prior.captured.location)
            )
        ),
      ]
      if (saved.durability === "synced") runtime.completeProjectSave(capture)
      else runtime.session({ dirty: true })
      adoptRoute(projectId)
      useState.setState({
        binding: { projectId, path: saved.path, commitId: saved.manifest.commitId },
        notice:
          saved.durability === "published-sync-uncertain"
            ? "syncUncertain"
            : action === "collect"
              ? "collected"
              : "saved",
      })
      remember(saved.manifest, saved.path)
      return projectId
    } finally {
      release()
    }
  }

  function importAudio(placement?: ImportAudioPlacement): Promise<string | null> {
    return run("import", async ({ signal }) => {
      const { autoWarp } = getImportPreferences()
      const epoch = runtime.projectEpoch()
      const path = placement?.path ?? (await storage.pickAudio())
      if (!path) return null
      void browserLibrary.stopAudition()
      cancelled(signal)
      stage("reading")
      const source = parseExternalMedia(await storage.inspectMedia(path))
      cancelled(signal)
      const tempo = autoWarp ? await analyzeTempo(path).catch(() => ({ bpm: null })) : { bpm: null }
      cancelled(signal)
      if (epoch !== runtime.projectEpoch()) throw new Error("Project changed while importing")
      const state = runtime.get()
      if (runtime.getCommittedDocument() !== state.document || state.session.preview)
        throw new Error("Finish the current edit before importing audio")
      const { bpm, numerator, denominator } = state.document.transport
      const startBar = placement?.startBar ?? state.session.insertionPoint?.bar ?? 1
      const detectedBpm = tempo.bpm
      const warp =
        detectedBpm !== null &&
        Number.isFinite(detectedBpm) &&
        detectedBpm > 0 &&
        detectedBpm <= 999
      const sourceBpm = warp ? detectedBpm : bpm
      if (
        !Number.isFinite(startBar) ||
        startBar < 1 ||
        !Number.isFinite(sourceBpm) ||
        sourceBpm <= 0 ||
        sourceBpm > 999
      ) {
        throw new Error("Audio placement requires a valid position and source tempo")
      }
      const durationBars =
        ((source.frames / source.sampleRate) * (warp ? sourceBpm : bpm)) /
        ((60 * numerator * 4) / denominator)
      const created = createClip("audio", startBar, durationBars)
      if (created.kind !== "audio") throw new Error("Invalid audio clip constructor")
      const clip = {
        ...created,
        sourceId: source.id,
        label: source.name,
        audioSettings: {
          ...defaultAudioClipSettings(sourceBpm, created),
          sourceBpm,
          warp,
          loop: false,
        },
      }
      const targetId = placement ? placement.trackId : state.session.selectedTrackIds[0]
      const target = state.document.tracks.find(
        track =>
          track.id === targetId &&
          canAcceptAudioDrop(track) &&
          (placement !== undefined || track.kind === "audio")
      )
      if (placement?.trackId && !target)
        throw new Error("The destination track cannot accept audio")
      const groupParent =
        target?.kind === "midi"
          ? state.document.tracks.find(
              item => item.kind === "group" && item.childTrackIds?.includes(target.id)
            )
          : undefined
      const track: Track =
        target?.kind === "midi"
          ? {
              ...target,
              kind: "audio",
              clips: [],
              input: "external",
              inputChannel: "1",
              output: groupParent?.id ?? "main",
              outputChannel: "1-2",
            }
          : (target ?? createTrack("audio", state.document.tracks, undefined, DEFAULT_TRACK_HEIGHT))
      const tracks = target
        ? state.document.tracks.map(item =>
            item.id === track.id
              ? {
                  ...track,
                  clips: insertClips(track.clips, [clip], () => uniqueId("clip"), bpm),
                }
              : item
          )
        : (() => {
            const tracks = [...state.document.tracks]
            const index = tracks.findIndex(item => item.kind === "return" || item.kind === "main")
            tracks.splice(index === -1 ? tracks.length : index, 0, {
              ...track,
              name: source.name,
              clips: [clip],
            })
            return tracks
          })()
      runtime.document({ ...state.document, media: [...state.document.media, source], tracks })
      runtime.session({
        selectedTrackIds: [track.id],
        selectedClipIds: [clip.id],
        trackSelectionSurface: "arrangement",
        // The clip's leading edge becomes the playback position, as when a clip is dropped.
        insertionPoint: { trackId: track.id, bar: clip.startBar },
        position: positionAtBar(clip.startBar),
      })
      useState.setState({ notice: autoWarp && !warp ? "tempoUnknown" : "imported" })
      return clip.id
    })
  }

  function relink(sourceId: string): Promise<string | null> {
    return run("relink", async ({ signal }) => {
      const epoch = runtime.projectEpoch()
      const source = runtime.get().document.media.find(item => item.id === sourceId)
      if (!source) throw new Error("Missing media source no longer exists")
      const path = await storage.pickAudio()
      if (!path) return null
      cancelled(signal)
      stage("reading")
      const replacement = parseExternalMedia(await storage.relinkMedia(source, path))
      cancelled(signal)
      if (
        replacement.id !== source.id ||
        replacement.sha256 !== source.sha256 ||
        replacement.byteLength !== source.byteLength ||
        replacement.sampleRate !== source.sampleRate ||
        replacement.frames !== source.frames ||
        replacement.channels !== source.channels
      ) {
        throw new Error("Replacement audio does not match the original fingerprint")
      }
      if (epoch !== runtime.projectEpoch()) throw new Error("Project changed while relinking")
      const current = runtime.get().document
      if (runtime.getCommittedDocument() !== current)
        throw new Error("Finish the current edit before relinking audio")
      if (current.media.find(item => item.id === source.id) !== source)
        throw new Error("Media source changed while relinking")
      runtime.document({
        ...current,
        media: current.media.map(item => (item.id === source.id ? replacement : item)),
      })
      useState.setState({
        issues: useState
          .getState()
          .issues.filter(
            issue =>
              issue.sourceId !== source.id ||
              replacement.location.kind !== "external" ||
              issue.path !== replacement.location.path
          ),
      })
      return source.id
    })
  }

  return {
    useState,
    files: {
      open,
      save: () => save(),
      saveAs: () => save("saveAs"),
      collect: () => save("collect"),
      importAudio: () => importAudio(),
      importAudioAt: (placement: ImportAudioPlacement) => importAudio(placement),
      relink,
      confirmDiscard,
      resolveDiscard,
      resolvePluginState(reference: PluginStateRef): PluginStateRef {
        return pluginStateBindings.get(reference.sha256) ?? reference
      },
      resolveSourceLocation(source: BackendSource): string {
        const stored = sourceBindings.find(
          item =>
            item.captured.id === source.id &&
            item.captured.sha256 === source.sha256 &&
            item.captured.location.kind !== "fixture" &&
            item.captured.location.path === source.uri
        )
        if (!stored) return source.uri
        const resolved = resolvedSource(stored.stored, stored.path)
        return resolved.location.kind === "external" ? resolved.location.path : source.uri
      },
      mediaIssues(): MediaIssue[] {
        const media = runtime.get().document.media
        return useState.getState().issues.filter(issue => {
          const source = media.find(item => item.id === issue.sourceId)
          if (!source) return false
          const effective = sourceForSave(source)
          return effective.location.kind === "external" && effective.location.path === issue.path
        })
      },
      externalDependencyCount(): number {
        const projectPath = useState.getState().binding?.path
        const directory = projectPath?.slice(
          0,
          Math.max(projectPath.lastIndexOf("/"), projectPath.lastIndexOf("\\")) + 1
        )
        return runtime.get().document.media.filter(source => {
          if (source.location.kind !== "external") return false
          const binding = sourceBindings.find(
            item =>
              item.captured.id === source.id &&
              item.captured.sha256 === source.sha256 &&
              JSON.stringify(item.captured.location) === JSON.stringify(source.location)
          )
          if (binding?.stored.location.kind === "project" && binding.path === projectPath)
            return false
          return !directory || !source.location.path.startsWith(`${directory}media/`)
        }).length
      },
      async cancel(): Promise<void> {
        if (!active) return
        const operation = active
        operation.abort.abort()
        resolveDiscard("cancel")
        const busy = useState.getState().operation
        if (busy.kind === "busy") useState.setState({ operation: { ...busy, stage: "cancelling" } })
        try {
          await storage.cancel(operation.id)
        } catch (error) {
          useState.setState({ error: error instanceof Error ? error.message : String(error) })
        }
      },
      resetBinding(projectId: string): void {
        if (active) throw new Error("A file operation is still active")
        sourceBindings = []
        pluginStateBindings.clear()
        untitledId = projectId
        useState.setState({ binding: null, issues: [], error: null, notice: null })
      },
      dismissError(): void {
        useState.setState({ error: null, notice: null })
      },
    },
  }
}
