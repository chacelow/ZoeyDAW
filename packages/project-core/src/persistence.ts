import { isAutomationTarget, sameAutomationTarget } from "./automation-target"
import { acceptsClip } from "./types"
import { isGridSettings, isLegacyGridBars } from "./grid"
import { MAX_AUTOMATION_CURVE, MIN_AUTOMATION_CURVE } from "./automation-curve"
import { isDevice } from "./devices"
import { isRack } from "./racks"
import { fixtureMediaSource, isMediaSource, serializeMediaSource } from "./media"
import type { MediaSource } from "./media"
import { isMidiNotes } from "./patterns"
import { isClip, isClipContent, serializeClip, clipContents } from "./clip-content"
import { initialLauncherDocument, isLauncherDocument } from "./launcher"
import type {
  AutomationTarget,
  DocumentState,
  MidiNote,
  MidiPattern,
  Track,
  WorkspaceState,
} from "./types"

const RULER_FORMATS: readonly string[] = ["time", "24", "25", "30", "29.97-drop", "29.97-non-drop"]

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === "string"
const bool = (v: unknown): v is boolean => typeof v === "boolean"
const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const positive = (v: unknown): v is number => number(v) && v > 0
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text)
const range = (start: unknown, end: unknown) => positive(start) && positive(end) && end > start
function snapshotLaneTarget(
  lane: { target?: unknown; parameter?: unknown },
  track: { kind?: unknown; devices?: unknown }
): AutomationTarget {
  if (isAutomationTarget(lane.target, track)) return lane.target
  if (
    lane.target === undefined &&
    (lane.parameter === "volume" || lane.parameter === "pan") &&
    (track.kind === "audio" ||
      track.kind === "group" ||
      track.kind === "return" ||
      track.kind === "main")
  )
    return { kind: "mixer", parameter: lane.parameter }
  throw new Error("Invalid automation target")
}

function uniqueIds(values: readonly { id?: string }[]): boolean {
  const ids = new Set<string>()
  for (const value of values) {
    if (value.id === undefined) {
      continue
    }
    if (ids.has(value.id)) {
      return false
    }
    ids.add(value.id)
  }
  return true
}

function isPattern(value: unknown): value is MidiPattern {
  return (
    record(value) &&
    text(value.id) &&
    value.id.length > 0 &&
    positive(value.loopBars) &&
    isMidiNotes(value.notes)
  )
}

function isTrack(v: unknown): v is Track {
  return (
    record(v) &&
    text(v.id) &&
    text(v.name) &&
    text(v.kind) &&
    ["audio", "midi", "group", "return", "main"].includes(v.kind) &&
    text(v.color) &&
    bool(v.solo) &&
    bool(v.armed) &&
    bool(v.mute) &&
    number(v.volumeDb) &&
    number(v.pan) &&
    text(v.input) &&
    text(v.output) &&
    (v.inputChannel === undefined || text(v.inputChannel)) &&
    (v.outputChannel === undefined || text(v.outputChannel)) &&
    (v.cueOutput === undefined || text(v.cueOutput)) &&
    (v.cueVolumeDb === undefined || number(v.cueVolumeDb)) &&
    (v.returnPost === undefined || bool(v.returnPost)) &&
    (v.sends === undefined ||
      (record(v.sends) &&
        Object.values(v.sends).every(level => number(level) && level >= -60 && level <= 6))) &&
    positive(v.heightPx) &&
    (v.devices === undefined ||
      (Array.isArray(v.devices) && v.devices.every(isDevice) && uniqueIds(v.devices))) &&
    (v.childTrackIds === undefined || strings(v.childTrackIds)) &&
    (v.collapsed === undefined || bool(v.collapsed)) &&
    text(v.monitor) &&
    ["in", "auto", "off"].includes(v.monitor) &&
    Array.isArray(v.clips) &&
    v.clips.every(isClip) &&
    (v.clipSlots === undefined ||
      (Array.isArray(v.clipSlots) &&
        v.clipSlots.every(
          slot =>
            record(slot) &&
            text(slot.sceneId) &&
            slot.sceneId.length > 0 &&
            isClipContent(slot.clip)
        ))) &&
    Array.isArray(v.automation) &&
    v.automation.every(
      lane =>
        record(lane) &&
        text(lane.id) &&
        (lane.target !== undefined
          ? isAutomationTarget(lane.target, v) && lane.parameter === undefined
          : (lane.parameter === "volume" || lane.parameter === "pan") &&
            (v.kind === "audio" ||
              v.kind === "group" ||
              v.kind === "return" ||
              v.kind === "main")) &&
        Array.isArray(lane.points) &&
        lane.points.every(
          point =>
            record(point) &&
            text(point.id) &&
            positive(point.bar) &&
            number(point.value) &&
            point.value >= 0 &&
            point.value <= 1 &&
            (point.curve === undefined ||
              (number(point.curve) &&
                point.curve >= MIN_AUTOMATION_CURVE &&
                point.curve <= MAX_AUTOMATION_CURVE))
        ) &&
        uniqueIds(lane.points)
    ) &&
    uniqueIds(v.automation) &&
    !v.automation.some((lane: unknown, index: number, lanes: unknown[]) =>
      lanes
        .slice(index + 1)
        .some(
          (other: unknown) =>
            record(lane) &&
            record(other) &&
            sameAutomationTarget(snapshotLaneTarget(lane, v), snapshotLaneTarget(other, v))
        )
    )
  )
}
function isDocument(v: unknown): v is DocumentState {
  if (
    !record(v) ||
    !text(v.name) ||
    !text(v.scaleRoot) ||
    !text(v.scaleMode) ||
    !number(v.groove) ||
    v.groove < 0 ||
    v.groove > 100 ||
    !record(v.transport) ||
    !number(v.transport.bpm) ||
    v.transport.bpm < 20 ||
    v.transport.bpm > 999 ||
    !number(v.transport.numerator) ||
    !Number.isInteger(v.transport.numerator) ||
    v.transport.numerator < 1 ||
    v.transport.numerator > 32 ||
    !number(v.transport.denominator) ||
    !Number.isInteger(Math.log2(v.transport.denominator)) ||
    v.transport.denominator < 1 ||
    v.transport.denominator > 32 ||
    !text(v.transport.barLength) ||
    !record(v.transport.loop) ||
    !bool(v.transport.loop.enabled) ||
    !range(v.transport.loop.startBar, v.transport.loop.endBar) ||
    !Array.isArray(v.tracks) ||
    !v.tracks.every(isTrack) ||
    !Array.isArray(v.media) ||
    !v.media.every(isMediaSource) ||
    !uniqueIds(v.media) ||
    !Array.isArray(v.patterns) ||
    !v.patterns.every(isPattern) ||
    !uniqueIds(v.patterns) ||
    !isLauncherDocument(v.launcher) ||
    !Array.isArray(v.markers) ||
    v.markers.some(
      marker =>
        !(
          record(marker) &&
          text(marker.id) &&
          positive(marker.bar) &&
          text(marker.label) &&
          (marker.color === undefined || text(marker.color))
        )
    ) ||
    (v.racks !== undefined &&
      (!Array.isArray(v.racks) || !v.racks.every(isRack) || !uniqueIds(v.racks)))
  ) {
    return false
  }
  const mediaIds = new Set(v.media.map(source => source.id))
  const patternIds = new Set(v.patterns.map(pattern => pattern.id))
  const sceneIds = new Set(v.launcher.scenes.map(scene => scene.id))
  const clipIds = new Set<string>()
  for (const track of v.tracks) {
    const occupied = new Set<string>()
    for (const slot of track.clipSlots ?? []) {
      if (!sceneIds.has(slot.sceneId) || occupied.has(slot.sceneId)) return false
      occupied.add(slot.sceneId)
    }
    for (const clip of clipContents(track)) {
      if (
        !acceptsClip(track.kind, clip.kind) ||
        clipIds.has(clip.id) ||
        (clip.kind === "pattern" && !patternIds.has(clip.patternId)) ||
        (clip.kind === "audio" && clip.sourceId !== null && !mediaIds.has(clip.sourceId))
      )
        return false
      clipIds.add(clip.id)
    }
  }
  const byId = new Map(v.tracks.map(track => [track.id, track]))
  if (
    byId.size !== v.tracks.length ||
    byId.get("main")?.kind !== "main" ||
    v.tracks.some(track => track.kind === "main" && track.id !== "main")
  ) {
    return false
  }
  if (
    (v.racks ?? []).some(
      rack => !byId.has(rack.ownerTrackId) || byId.get(rack.ownerTrackId)?.kind === "main"
    )
  ) {
    return false
  }
  const parentOf = new Map<string, string>()
  for (const track of v.tracks) {
    if (
      Object.keys(track.sends ?? {}).some(id => id === track.id || byId.get(id)?.kind !== "return")
    ) {
      return false
    }
    if (
      track.output !== "none" &&
      track.output !== "external" &&
      !["group", "main"].includes(byId.get(track.output)?.kind ?? "")
    ) {
      return false
    }
    if (track.childTrackIds?.length && track.kind !== "group") {
      return false
    }
    if (track.childTrackIds != null) {
      for (const id of track.childTrackIds) {
        if (!byId.has(id) || id === track.id || parentOf.has(id)) {
          return false
        }
        parentOf.set(id, track.id)
      }
    }
  }
  for (const track of v.tracks) {
    const ancestors = new Set([track.id])
    let parent = parentOf.get(track.id)
    while (parent) {
      if (ancestors.has(parent)) {
        return false
      }
      ancestors.add(parent)
      parent = parentOf.get(parent)
    }
    if (track.output !== "none" && track.output !== "external") {
      const destination = byId.get(track.output)
      if (destination?.kind === "group" && parentOf.get(track.id) !== destination.id) {
        return false
      }
    }
    if (parentOf.has(track.id) && track.output !== parentOf.get(track.id)) {
      return false
    }
    const routed = new Set([track.id])
    let next = byId.get(track.output)
    while (next) {
      if (routed.has(next.id)) {
        return false
      }
      routed.add(next.id)
      next = byId.get(next.output)
    }
  }
  return true
}
function isWorkspace(v: unknown): v is Omit<WorkspaceState, "arrangementView" | "rulerFormat"> & {
  arrangementView?: WorkspaceState["arrangementView"]
  rulerFormat?: WorkspaceState["rulerFormat"]
} {
  return (
    record(v) &&
    positive(v.pxPerBar) &&
    number(v.scrollX) &&
    v.scrollX >= 0 &&
    number(v.scrollY) &&
    v.scrollY >= 0 &&
    bool(v.snap) &&
    isGridSettings(v.grid) &&
    bool(v.follow) &&
    bool(v.automationMode) &&
    bool(v.drawMode) &&
    bool(v.computerKeyboard) &&
    bool(v.link) &&
    (v.metronome === undefined || bool(v.metronome)) &&
    (v.arrangementView === undefined ||
      (record(v.arrangementView) &&
        bool(v.arrangementView.routing) &&
        bool(v.arrangementView.returns) &&
        bool(v.arrangementView.overview))) &&
    (v.rulerFormat === undefined ||
      (text(v.rulerFormat) && RULER_FORMATS.includes(v.rulerFormat))) &&
    (v.automationLanes === undefined ||
      (record(v.automationLanes) &&
        Object.values(v.automationLanes).every(
          items =>
            Array.isArray(items) &&
            items.every(item => record(item) && (item.kind === "mixer" || item.kind === "device"))
        )))
  )
}

function migrateLegacyPatterns(value: unknown): unknown {
  if (!record(value) || !Array.isArray(value.tracks)) return value
  if (
    value.patterns !== undefined &&
    (!Array.isArray(value.patterns) || !value.patterns.every(isPattern))
  )
    throw new Error("Invalid shared Pattern content")
  const patterns: MidiPattern[] =
    Array.isArray(value.patterns) && value.patterns.every(isPattern)
      ? structuredClone(value.patterns)
      : []
  const numerator =
    record(value.transport) && positive(value.transport.numerator) ? value.transport.numerator : 4
  const tracks = value.tracks.map(track => {
    if (!record(track) || !Array.isArray(track.clips)) return track
    return {
      ...track,
      clips: track.clips.map(clip => {
        if (!record(clip) || clip.kind !== "pattern" || !text(clip.patternId)) return clip
        const { steps, ...placement } = clip
        if (steps !== undefined && (!Array.isArray(steps) || !steps.every(bool)))
          throw new Error("Invalid legacy Pattern steps")
        const existing = patterns.find(pattern => pattern.id === clip.patternId)
        if (steps === undefined && existing) return placement
        const notes: MidiNote[] = Array.isArray(steps)
          ? steps.flatMap((active, index) =>
              active
                ? [
                    {
                      pitch: 60,
                      velocity: 100,
                      startBeat: (index * numerator) / 16,
                      lengthBeats: numerator / 16,
                    },
                  ]
                : []
            )
          : []
        const loopBars =
          Array.isArray(steps) && steps.length
            ? steps.length / 16
            : positive(clip.lengthBars)
              ? clip.lengthBars
              : 1
        if (
          existing &&
          existing.loopBars === loopBars &&
          JSON.stringify(existing.notes) === JSON.stringify(notes)
        )
          return placement
        let id = clip.patternId
        if (existing) {
          const base = `${id}-legacy-${text(clip.id) ? clip.id : patterns.length}`
          id = base
          for (let suffix = 1; patterns.some(pattern => pattern.id === id); suffix++)
            id = `${base}-${suffix}`
        }
        patterns.push({ id, notes, loopBars })
        return { ...placement, patternId: id }
      }),
    }
  })
  return { ...value, tracks, patterns }
}

function migrateLegacyWarpModes(value: unknown): unknown {
  if (!record(value) || !Array.isArray(value.tracks)) return value
  return {
    ...value,
    tracks: value.tracks.map(track => {
      if (!record(track) || !Array.isArray(track.clips)) return track
      return {
        ...track,
        clips: track.clips.map(clip => {
          if (!record(clip) || clip.kind !== "audio" || !record(clip.audioSettings)) return clip
          const mode = clip.audioSettings.warpMode
          if (
            mode !== "beats" &&
            mode !== "tones" &&
            mode !== "texture" &&
            mode !== "complex" &&
            mode !== "complex-pro" &&
            mode !== "repitch"
          )
            return clip
          return {
            ...clip,
            audioSettings: {
              ...clip.audioSettings,
              warpMode: mode === "repitch" ? "re-pitch" : "soundtouch",
            },
          }
        }),
      }
    }),
  }
}

function migrateLegacyDocument(value: unknown): unknown {
  if (!record(value) || !Array.isArray(value.tracks)) return value
  const media: MediaSource[] = []
  const tracks = value.tracks.map(track => {
    if (!record(track) || !Array.isArray(track.clips)) return track
    return {
      ...track,
      clips: track.clips.map(clip => {
        if (!record(clip) || clip.kind !== "audio" || !("samplePath" in clip)) return clip
        if (!text(clip.samplePath)) throw new Error("Invalid legacy audio source")
        const path = clip.samplePath
        if (path !== "" && !path.startsWith("mock://")) {
          throw new Error("Legacy audio files must be imported before opening this snapshot")
        }
        if (path && !media.some(source => source.id === path)) media.push(fixtureMediaSource(path))
        const { samplePath: _legacyPath, ...authored } = clip
        return { ...authored, sourceId: path || null }
      }),
    }
  })
  return { ...value, tracks, media: value.media ?? media }
}
/**
Parse first, then atomically replace state. Unknown keys never cross this boundary.
*/
export function parseProject(json: string): { document: DocumentState; workspace: WorkspaceState } {
  const payload: unknown = JSON.parse(json)
  if (
    !record(payload) ||
    (payload.version !== 1 &&
      payload.version !== 2 &&
      payload.version !== 3 &&
      payload.version !== 4 &&
      payload.version !== 5)
  ) {
    throw new Error("Invalid or unsupported project snapshot")
  }
  const legacyDocument =
    payload.version === 1 || payload.version === 2
      ? migrateLegacyDocument(payload.document)
      : payload.document
  const migrated =
    payload.version === 4 || payload.version === 5
      ? legacyDocument
      : migrateLegacyPatterns(legacyDocument)
  const warped = migrateLegacyWarpModes(migrated)
  const document_ =
    payload.version === 5 || !record(warped) || warped.launcher !== undefined
      ? warped
      : { ...warped, launcher: initialLauncherDocument() }
  if (!isDocument(document_)) throw new Error("Invalid or unsupported project snapshot")
  const rawWorkspace = payload.workspace
  let workspacePayload: unknown = rawWorkspace
  if (payload.version === 1) {
    if (
      !record(rawWorkspace) ||
      !number(rawWorkspace.gridBars) ||
      !isLegacyGridBars(
        rawWorkspace.gridBars,
        document_.transport.numerator,
        document_.transport.denominator
      )
    ) {
      throw new Error("Invalid or unsupported project snapshot")
    }
    workspacePayload = { ...rawWorkspace, grid: { mode: "fixed", bars: rawWorkspace.gridBars } }
  }
  if (!isWorkspace(workspacePayload)) {
    throw new Error("Invalid or unsupported project snapshot")
  }
  const view = workspacePayload
  const displayed = view.automationLanes ?? {}
  for (const [trackId, targets] of Object.entries(displayed)) {
    const track = document_.tracks.find(item => item.id === trackId)
    if (
      !track ||
      !Array.isArray(targets) ||
      targets.some(target => !isAutomationTarget(target, track)) ||
      targets.some((target, index) =>
        targets.slice(index + 1).some(other => sameAutomationTarget(target, other))
      )
    ) {
      throw new Error("Invalid or unsupported project snapshot")
    }
  }
  return {
    document: {
      name: document_.name,
      scaleRoot: document_.scaleRoot,
      scaleMode: document_.scaleMode,
      groove: document_.groove,
      media: document_.media.map(serializeMediaSource),
      patterns: document_.patterns.map(pattern => ({
        id: pattern.id,
        loopBars: pattern.loopBars,
        notes: pattern.notes.map(note => ({ ...note })),
      })),
      launcher: {
        quantization: document_.launcher.quantization,
        scenes: document_.launcher.scenes.map(scene => ({
          id: scene.id,
          name: scene.name,
          ...(scene.color === undefined ? {} : { color: scene.color }),
        })),
      },
      ...(document_.racks === undefined ? {} : { racks: structuredClone(document_.racks) }),
      transport: {
        bpm: document_.transport.bpm,
        numerator: document_.transport.numerator,
        denominator: document_.transport.denominator,
        barLength: document_.transport.barLength,
        loop: {
          enabled: document_.transport.loop.enabled,
          startBar: document_.transport.loop.startBar,
          endBar: document_.transport.loop.endBar,
        },
      },
      tracks: document_.tracks.map(track => {
        return {
          id: track.id,
          name: track.name,
          kind: track.kind,
          color: track.color,
          solo: track.solo,
          armed: track.armed,
          mute: track.mute,
          volumeDb: track.volumeDb,
          pan: track.pan,
          input: track.kind === "audio" && track.input !== "none" ? "external" : track.input,
          output: track.output,
          ...(track.kind === "audio"
            ? {
                inputChannel:
                  track.inputChannel ??
                  (["1", "2", "1-2"].includes(track.input) ? track.input : "1"),
              }
            : track.inputChannel === undefined
              ? {}
              : { inputChannel: track.inputChannel }),
          ...(track.outputChannel === undefined ? {} : { outputChannel: track.outputChannel }),
          ...(track.cueOutput === undefined ? {} : { cueOutput: track.cueOutput }),
          ...(track.cueVolumeDb === undefined ? {} : { cueVolumeDb: track.cueVolumeDb }),
          ...(track.returnPost === undefined ? {} : { returnPost: track.returnPost }),
          ...(track.sends === undefined ? {} : { sends: { ...track.sends } }),
          ...(track.devices === undefined ? {} : { devices: structuredClone(track.devices) }),
          clips: track.clips.map(clip => serializeClip(clip)),
          ...(track.clipSlots === undefined
            ? {}
            : {
                clipSlots: track.clipSlots.map(slot => ({
                  sceneId: slot.sceneId,
                  clip: serializeClip(slot.clip),
                })),
              }),
          heightPx: track.heightPx,
          ...(track.childTrackIds === undefined ? {} : { childTrackIds: [...track.childTrackIds] }),
          ...(track.collapsed === undefined ? {} : { collapsed: track.collapsed }),
          monitor: track.monitor,
          automation: track.automation.map(lane => ({
            id: lane.id,
            target: snapshotLaneTarget(lane, track),
            points: lane.points.map(point => ({
              id: point.id,
              bar: point.bar,
              value: point.value,
              ...(point.curve === undefined ? {} : { curve: point.curve }),
            })),
          })),
        }
      }),
      markers: document_.markers.map(marker => ({
        id: marker.id,
        bar: marker.bar,
        label: marker.label,
        ...(marker.color === undefined ? {} : { color: marker.color }),
      })),
    },
    workspace: {
      pxPerBar: view.pxPerBar,
      scrollX: view.scrollX,
      scrollY: view.scrollY,
      snap: view.snap,
      grid:
        view.grid.mode === "adaptive"
          ? {
              mode: "adaptive",
              density: view.grid.density,
              ...(view.grid.triplet && { triplet: true }),
            }
          : { mode: "fixed", bars: view.grid.bars, ...(view.grid.triplet && { triplet: true }) },
      follow: view.follow,
      automationMode: view.automationMode,
      arrangementView: {
        routing: view.arrangementView?.routing ?? true,
        returns: view.arrangementView?.returns ?? true,
        overview: view.arrangementView?.overview ?? true,
      },
      rulerFormat: view.rulerFormat ?? "time",
      automationLanes: structuredClone(displayed),
      drawMode: view.drawMode,
      computerKeyboard: view.computerKeyboard,
      link: view.link,
      metronome: view.metronome ?? false,
    },
  }
}
export function stringifyProject(document: DocumentState, workspace: WorkspaceState): string {
  return JSON.stringify({
    version: 5,
    ...parseProject(JSON.stringify({ version: 5, document, workspace })),
  })
}
