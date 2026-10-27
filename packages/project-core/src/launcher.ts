import { uniqueId } from "./reducers"
import { acceptsClip } from "./types"
import { locateClip, serializeClip } from "./clip-content"
import type {
  ClipContent,
  DocumentState,
  LauncherDocument,
  LauncherScene,
  LaunchQuantization,
} from "./types"

export const LAUNCH_QUANTIZATIONS: readonly LaunchQuantization[] = [
  "none",
  "eightBars",
  "fourBars",
  "twoBars",
  "bar",
  "half",
  "quarter",
  "eighth",
  "sixteenth",
]
export const MAX_LAUNCHER_SCENES = 256
export function initialLauncherDocument(): LauncherDocument {
  return { scenes: [], quantization: "bar" }
}

function isScene(value: unknown): value is LauncherScene {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    "name" in value &&
    typeof value.name === "string" &&
    (!("color" in value) || value.color === undefined || typeof value.color === "string")
  )
}

export function isLauncherDocument(value: unknown): value is LauncherDocument {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("scenes" in value) ||
    !("quantization" in value) ||
    !Array.isArray(value.scenes) ||
    !value.scenes.every(isScene) ||
    value.scenes.length > MAX_LAUNCHER_SCENES ||
    !LAUNCH_QUANTIZATIONS.some(quantization => quantization === value.quantization)
  )
    return false
  const ids = new Set<string>()
  for (const scene of value.scenes) {
    if (ids.has(scene.id)) return false
    ids.add(scene.id)
  }
  return true
}

export function addScene(document: DocumentState, name: string): DocumentState {
  if (document.launcher.scenes.length >= MAX_LAUNCHER_SCENES) return document
  return {
    ...document,
    launcher: {
      ...document.launcher,
      scenes: [...document.launcher.scenes, { id: uniqueId("scene"), name }],
    },
  }
}

export function updateScene(
  document: DocumentState,
  id: string,
  patch: Partial<Pick<LauncherScene, "name" | "color">>
): DocumentState {
  const scene = document.launcher.scenes.find(scene => scene.id === id)
  if (
    !scene ||
    Object.entries(patch).every(
      ([key, value]) => (key === "name" ? scene.name : scene.color) === value
    )
  )
    return document
  return {
    ...document,
    launcher: {
      ...document.launcher,
      scenes: document.launcher.scenes.map(scene =>
        scene.id === id ? { ...scene, ...patch } : scene
      ),
    },
  }
}

export function removeScene(document: DocumentState, id: string): DocumentState {
  if (!document.launcher.scenes.some(scene => scene.id === id)) return document
  return {
    ...document,
    launcher: {
      ...document.launcher,
      scenes: document.launcher.scenes.filter(scene => scene.id !== id),
    },
    tracks: document.tracks.map(track =>
      track.clipSlots?.some(slot => slot.sceneId === id)
        ? { ...track, clipSlots: track.clipSlots.filter(slot => slot.sceneId !== id) }
        : track
    ),
  }
}

export function moveScene(document: DocumentState, id: string, destination: number): DocumentState {
  const source = document.launcher.scenes.findIndex(scene => scene.id === id)
  if (
    source === -1 ||
    !Number.isInteger(destination) ||
    destination < 0 ||
    destination >= document.launcher.scenes.length ||
    source === destination
  )
    return document
  const scenes = [...document.launcher.scenes]
  const [scene] = scenes.splice(source, 1)
  scenes.splice(destination, 0, scene)
  return { ...document, launcher: { ...document.launcher, scenes } }
}

export function setLaunchQuantization(
  document: DocumentState,
  quantization: LaunchQuantization
): DocumentState {
  return document.launcher.quantization === quantization
    ? document
    : { ...document, launcher: { ...document.launcher, quantization } }
}

export function putClipSlot(
  document: DocumentState,
  trackId: string,
  sceneId: string,
  clip: ClipContent | null
): DocumentState {
  const track = document.tracks.find(track => track.id === trackId)
  if (
    !track ||
    !document.launcher.scenes.some(scene => scene.id === sceneId) ||
    (clip && !acceptsClip(track.kind, clip.kind))
  )
    return document
  const existing = track.clipSlots?.find(slot => slot.sceneId === sceneId)
  if (existing?.clip === clip || (!existing && clip === null)) return document
  const slots = (track.clipSlots ?? []).filter(slot => slot.sceneId !== sceneId)
  if (clip) slots.push({ sceneId, clip })
  return {
    ...document,
    tracks: document.tracks.map(track =>
      track.id === trackId ? { ...track, clipSlots: slots } : track
    ),
  }
}

export function copyClipToSlot(
  document: DocumentState,
  clipId: string,
  trackId: string,
  sceneId: string
): DocumentState {
  const source = locateClip(document.tracks, clipId)
  if (!source) return document
  let content: ClipContent
  if (source.kind === "arrangement") {
    const { startBar: _startBar, ...data } = serializeClip(source.clip)
    content = data
  } else content = serializeClip(source.clip)
  return putClipSlot(document, trackId, sceneId, { ...content, id: uniqueId(content.kind) })
}

export function moveClipSlot(
  document: DocumentState,
  sourceTrack: string,
  sourceScene: string,
  targetTrack: string,
  targetScene: string,
  copy: boolean
): DocumentState {
  const track = document.tracks.find(track => track.id === sourceTrack)
  const source = track?.clipSlots?.find(slot => slot.sceneId === sourceScene)
  const target = document.tracks.find(track => track.id === targetTrack)
  if (
    !source ||
    !target ||
    !acceptsClip(target.kind, source.clip.kind) ||
    !document.launcher.scenes.some(scene => scene.id === targetScene)
  )
    return document
  if (sourceTrack === targetTrack && sourceScene === targetScene) return document
  if (copy) return copyClipToSlot(document, source.clip.id, targetTrack, targetScene)
  return putClipSlot(
    putClipSlot(document, sourceTrack, sourceScene, null),
    targetTrack,
    targetScene,
    source.clip
  )
}

export function createMidiClipSlot(
  document: DocumentState,
  trackId: string,
  sceneId: string
): DocumentState {
  return putClipSlot(document, trackId, sceneId, {
    id: uniqueId("midi"),
    kind: "midi",
    lengthBars: 1,
    sourceOffsetBars: 0,
    notes: [],
    loopBars: 1,
  })
}
