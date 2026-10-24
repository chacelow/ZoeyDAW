export type MediaLocation =
  | { kind: "external"; path: string }
  | { kind: "project"; path: string }
  | { kind: "fixture"; uri: string }

export interface MediaSource {
  id: string
  name: string
  sha256: string
  byteLength: number
  sampleRate: number
  frames: number
  channels: number
  location: MediaLocation
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0

export function isMediaSource(value: unknown): value is MediaSource {
  if (
    !record(value) ||
    !nonempty(value.id) ||
    !nonempty(value.name) ||
    typeof value.sha256 !== "string" ||
    !count(value.byteLength) ||
    !count(value.frames) ||
    !count(value.sampleRate) ||
    !count(value.channels) ||
    !record(value.location)
  )
    return false
  const location = value.location
  if (location.kind === "fixture") {
    return (
      nonempty(location.uri) &&
      location.uri.startsWith("mock://") &&
      (value.sha256 === "" || /^[a-fA-F0-9]{64}$/.test(value.sha256))
    )
  }
  if (!nonempty(location.path) || location.path.includes("\0")) return false
  const validPath =
    location.kind === "external"
      ? /^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(location.path)
      : location.kind === "project" &&
        /^media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(wav|aiff|flac|mp3)$/.test(
          location.path
        )
  return (
    validPath &&
    /^[a-fA-F0-9]{64}$/.test(value.sha256) &&
    value.sampleRate > 0 &&
    value.channels > 0
  )
}

export function serializeMediaSource(source: MediaSource): MediaSource {
  return {
    id: source.id,
    name: source.name,
    sha256: source.sha256,
    byteLength: source.byteLength,
    sampleRate: source.sampleRate,
    frames: source.frames,
    channels: source.channels,
    location:
      source.location.kind === "fixture"
        ? { kind: "fixture", uri: source.location.uri }
        : { kind: source.location.kind, path: source.location.path },
  }
}

export function findMediaSource(
  media: readonly MediaSource[],
  sourceId: string | null
): MediaSource | undefined {
  return sourceId === null ? undefined : media.find(source => source.id === sourceId)
}

export function resolveMediaUri(source: MediaSource): string {
  switch (source.location.kind) {
    case "fixture":
      return source.location.uri
    case "external":
      return source.location.path
    case "project":
      return source.location.path
  }
}

export function fixtureMediaSource(uri: string): MediaSource {
  return {
    id: uri,
    name: uri.split(/[\\/]/).at(-1) || uri,
    sha256: "",
    byteLength: 0,
    sampleRate: 0,
    frames: 0,
    channels: 0,
    location: { kind: "fixture", uri },
  }
}
