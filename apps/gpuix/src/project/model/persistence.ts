import { PREFERENCE_DEFAULTS } from "../defaults/preferences"
import { PROJECT_TEMPLATE } from "../defaults/template"
import { acceptsClip } from "./types"
import { isGridSettings, isLegacyGridBars } from "./grid"
import { MAX_AUTOMATION_CURVE, MIN_AUTOMATION_CURVE } from "./automation-curve"
import { isAudioClipSettings } from "./audio-editor"
import { isDevice } from "./devices"
import type { Clip, DocumentState, Track, WorkspaceState } from "./types"

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === "string"
const bool = (v: unknown): v is boolean => typeof v === "boolean"
const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const positive = (v: unknown): v is number => number(v) && v > 0
const barPosition = (v: unknown): v is number => number(v) && v >= 1
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text)
const range = (start: unknown, end: unknown) =>
  barPosition(start) && barPosition(end) && end > start
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

export function isClip(v: unknown): v is Clip {
  if (
    !record(v) ||
    !text(v.id) ||
    !barPosition(v.startBar) ||
    !positive(v.lengthBars) ||
    (v.sourceOffsetBars !== undefined && !number(v.sourceOffsetBars)) ||
    (v.label !== undefined && !text(v.label)) ||
    (v.color !== undefined && !text(v.color))
  ) {
    return false
  }
  const sourceOffset = v.sourceOffsetBars ?? 0
  if (
    !number(sourceOffset) ||
    !number(v.startBar + v.lengthBars) ||
    !number(sourceOffset + v.lengthBars)
  ) {
    return false
  }
  if (v.kind === "audio") {
    const fadeIn = v.fadeInBars ?? PROJECT_TEMPLATE.clip.fade.durationBars
    const fadeOut = v.fadeOutBars ?? PROJECT_TEMPLATE.clip.fade.durationBars
    const inOffset = v.fadeInOffsetBars ?? PROJECT_TEMPLATE.clip.fade.offsetBars
    const outOffset = v.fadeOutOffsetBars ?? PROJECT_TEMPLATE.clip.fade.offsetBars
    return (
      text(v.samplePath) &&
      number(v.gainDb) &&
      (v.audioSettings === undefined || isAudioClipSettings(v.audioSettings)) &&
      number(fadeIn) &&
      (v.fadeInBars === undefined || number(v.fadeInBars)) &&
      fadeIn >= 0 &&
      number(fadeOut) &&
      (v.fadeOutBars === undefined || number(v.fadeOutBars)) &&
      fadeOut >= 0 &&
      number(inOffset) &&
      (v.fadeInOffsetBars === undefined || number(v.fadeInOffsetBars)) &&
      inOffset >= 0 &&
      number(outOffset) &&
      (v.fadeOutOffsetBars === undefined || number(v.fadeOutOffsetBars)) &&
      outOffset >= 0 &&
      (v.fadeInCurve === undefined ||
        (number(v.fadeInCurve) && v.fadeInCurve >= -1 && v.fadeInCurve <= 1)) &&
      (v.fadeOutCurve === undefined ||
        (number(v.fadeOutCurve) && v.fadeOutCurve >= -1 && v.fadeOutCurve <= 1)) &&
      (v.fadeInCurvePosition === undefined ||
        (number(v.fadeInCurvePosition) &&
          v.fadeInCurvePosition >= 0.1 &&
          v.fadeInCurvePosition <= 0.9)) &&
      (v.fadeOutCurvePosition === undefined ||
        (number(v.fadeOutCurvePosition) &&
          v.fadeOutCurvePosition >= 0.1 &&
          v.fadeOutCurvePosition <= 0.9)) &&
      inOffset + fadeIn <= v.lengthBars &&
      outOffset + fadeOut <= v.lengthBars &&
      inOffset + fadeIn + outOffset + fadeOut <=
        v.lengthBars + Number.EPSILON * Math.max(1, v.lengthBars)
    )
  }
  return v.kind === "pattern"
    ? text(v.patternId) &&
        (v.steps === undefined || (Array.isArray(v.steps) && v.steps.every(bool)))
    : v.kind === "midi" &&
        (v.loopBars === undefined || positive(v.loopBars)) &&
        Array.isArray(v.notes) &&
        v.notes.every(note => {
          return (
            record(note) &&
            (note.id === undefined || text(note.id)) &&
            number(note.pitch) &&
            Number.isInteger(note.pitch) &&
            note.pitch >= 0 &&
            note.pitch <= 127 &&
            number(note.startBeat) &&
            note.startBeat >= 0 &&
            positive(note.lengthBeats) &&
            number(note.velocity) &&
            Number.isInteger(note.velocity) &&
            note.velocity >= 0 &&
            note.velocity <= 127
          )
        }) &&
        uniqueIds(v.notes)
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
    Array.isArray(v.automation) &&
    v.automation.every(
      lane =>
        record(lane) &&
        text(lane.id) &&
        text(lane.parameter) &&
        ["volume", "pan"].includes(lane.parameter) &&
        Array.isArray(lane.points) &&
        lane.points.every(
          point =>
            record(point) &&
            text(point.id) &&
            barPosition(point.bar) &&
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
    uniqueIds(v.automation)
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
    !Number.isInteger(v.transport.denominator) ||
    v.transport.denominator < 1 ||
    v.transport.denominator > 32 ||
    !text(v.transport.barLength) ||
    !record(v.transport.loop) ||
    !bool(v.transport.loop.enabled) ||
    !range(v.transport.loop.startBar, v.transport.loop.endBar) ||
    !Array.isArray(v.tracks) ||
    !v.tracks.every(isTrack) ||
    !Array.isArray(v.markers) ||
    v.markers.some(
      marker =>
        !(
          record(marker) &&
          text(marker.id) &&
          barPosition(marker.bar) &&
          text(marker.label) &&
          (marker.color === undefined || text(marker.color))
        )
    ) ||
    !uniqueIds(v.markers)
  ) {
    return false
  }
  const byId = new Map(v.tracks.map(track => [track.id, track]))
  if (
    byId.size !== v.tracks.length ||
    byId.get("main")?.kind !== "main" ||
    v.tracks.some(track => track.kind === "main" && track.id !== "main")
  ) {
    return false
  }
  const clipIds = v.tracks.flatMap(track => track.clips.map(clip => clip.id))
  if (new Set(clipIds).size !== clipIds.length) {
    return false
  }
  const parentOf = new Map<string, string>()
  for (const track of v.tracks) {
    if (
      track.clips.some(clip => !acceptsClip(track.kind, clip.kind)) ||
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
function isWorkspace(v: unknown): v is WorkspaceState {
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
    bool(v.metronome)
  )
}

export function serializeClip(clip: Clip): Clip {
  const base = {
    id: clip.id,
    kind: clip.kind,
    startBar: clip.startBar,
    lengthBars: clip.lengthBars,
    ...(clip.sourceOffsetBars !== undefined && { sourceOffsetBars: clip.sourceOffsetBars }),
    ...(clip.label !== undefined && { label: clip.label }),
    ...(clip.color !== undefined && { color: clip.color }),
  }
  switch (clip.kind) {
    case "audio": {
      return {
        ...base,
        kind: "audio",
        samplePath: clip.samplePath,
        gainDb: clip.gainDb,
        ...(clip.audioSettings === undefined
          ? {}
          : { audioSettings: structuredClone(clip.audioSettings) }),
        ...(clip.fadeInBars !== undefined && { fadeInBars: clip.fadeInBars }),
        ...(clip.fadeOutBars !== undefined && { fadeOutBars: clip.fadeOutBars }),
        ...(clip.fadeInOffsetBars !== undefined && { fadeInOffsetBars: clip.fadeInOffsetBars }),
        ...(clip.fadeOutOffsetBars !== undefined && { fadeOutOffsetBars: clip.fadeOutOffsetBars }),
        ...(clip.fadeInCurve !== undefined && { fadeInCurve: clip.fadeInCurve }),
        ...(clip.fadeOutCurve !== undefined && { fadeOutCurve: clip.fadeOutCurve }),
        ...(clip.fadeInCurvePosition !== undefined && {
          fadeInCurvePosition: clip.fadeInCurvePosition,
        }),
        ...(clip.fadeOutCurvePosition !== undefined && {
          fadeOutCurvePosition: clip.fadeOutCurvePosition,
        }),
      }
    }
    case "midi": {
      return {
        ...base,
        kind: "midi",
        ...(clip.loopBars !== undefined && { loopBars: clip.loopBars }),
        notes: clip.notes.map(note => {
          return {
            pitch: note.pitch,
            startBeat: note.startBeat,
            lengthBeats: note.lengthBeats,
            velocity: note.velocity,
            ...(note.id === undefined ? {} : { id: note.id }),
          }
        }),
      }
    }
    case "pattern": {
      return {
        ...base,
        kind: "pattern",
        patternId: clip.patternId,
        ...(clip.steps !== undefined && { steps: [...clip.steps] }),
      }
    }
  }
}
export function parseProject(json: string): { document: DocumentState; workspace: WorkspaceState } {
  const payload: unknown = JSON.parse(json)
  if (
    !record(payload) ||
    (payload.version !== 1 && payload.version !== 2) ||
    !isDocument(payload.document)
  ) {
    throw new Error("Invalid or unsupported project snapshot")
  }
  const document_ = payload.document
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
  if (record(workspacePayload) && !("metronome" in workspacePayload)) {
    workspacePayload = { ...workspacePayload, metronome: PREFERENCE_DEFAULTS.workspace.metronome }
  }
  if (!isWorkspace(workspacePayload)) {
    throw new Error("Invalid or unsupported project snapshot")
  }
  const view = workspacePayload
  return {
    document: {
      name: document_.name,
      scaleRoot: document_.scaleRoot,
      scaleMode: document_.scaleMode,
      groove: document_.groove,
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
          clips: track.clips.map(clip => {
            const copy = serializeClip(clip)
            if (copy.kind === "midi") {
              const ids = new Set(
                copy.notes.flatMap(note => (note.id === undefined ? [] : [note.id]))
              )
              let nextId = 0
              for (const note of copy.notes) {
                if (note.id !== undefined) {
                  continue
                }
                let id: string
                do {
                  id = `snapshot-note-${nextId++}`
                } while (ids.has(id))
                note.id = id
                ids.add(id)
              }
            }
            return copy
          }),
          heightPx: track.heightPx,
          ...(track.childTrackIds === undefined ? {} : { childTrackIds: [...track.childTrackIds] }),
          ...(track.collapsed === undefined ? {} : { collapsed: track.collapsed }),
          monitor: track.monitor,
          automation: track.automation.map(lane => ({
            id: lane.id,
            parameter: lane.parameter,
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
          ? { mode: "adaptive", density: view.grid.density }
          : { mode: "fixed", bars: view.grid.bars },
      follow: view.follow,
      automationMode: view.automationMode,
      drawMode: view.drawMode,
      computerKeyboard: view.computerKeyboard,
      link: view.link,
      metronome: view.metronome,
    },
  }
}
export function stringifyProject(document: DocumentState, workspace: WorkspaceState): string {
  return JSON.stringify({
    version: 2,
    ...parseProject(JSON.stringify({ version: 2, document, workspace })),
  })
}
