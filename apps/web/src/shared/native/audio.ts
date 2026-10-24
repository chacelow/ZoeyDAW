import { invoke, isTauri } from "@tauri-apps/api/core"
import { z } from "zod"
import { jsonU64Schema } from "@zoeydaw/project-core/realtime"
import { isMediaSource, type MediaSource } from "@zoeydaw/project-core/media"
import {
  waveformRangeRequestSchema,
  waveformRangeSchema,
} from "@zoeydaw/project-core/waveform-range"
import type { WaveformRange, WaveformRangeRequest } from "@zoeydaw/project-core/waveform-range"

const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const finite = z.number().finite()
const generation = jsonU64Schema.transform(value => value.toString())
const requestFields = {
  protocolVersion: z.literal(2),
  sessionId: z.string().min(1),
  sequence: counter,
}
const controlRequestSchema = z
  .object({
    ...requestFields,
    controlGeneration: generation,
    control: z
      .object({
        playing: z.boolean(),
        recording: z.boolean(),
        seekBar: finite.min(1),
        seekGeneration: counter,
        metronome: z.boolean().optional(),
      })
      .strict(),
  })
  .strict()
const noteRequestSchema = z
  .object({
    ...requestFields,
    sequence: counter.positive(),
    note: z
      .object({
        trackId: z.string().min(1),
        noteId: z.string().min(1),
        pitch: z.number().int().min(0).max(127),
        velocity: z.number().int().min(0).max(127),
        on: z.boolean(),
        requestedSample: generation.optional(),
      })
      .strict(),
  })
  .strict()
const channelSelectionSchema = z
  .array(counter)
  .refine(
    channels => new Set(channels).size === channels.length,
    "Channel selections must not contain duplicates"
  )
const deviceInfoSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    host: z.string(),
    inputChannels: counter,
    outputChannels: counter,
  })
  .strict()
const hostSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    separateInputOutput: z.boolean(),
    controlPanel: z.boolean(),
  })
  .strict()
const deviceConfigurationSchema = z
  .object({
    host: z.string().min(1),
    inputDeviceId: z.string().min(1).nullable(),
    outputDeviceId: z.string().min(1).nullable(),
    sampleRate: finite.positive(),
    bufferFrames: counter.positive(),
    inputMono: channelSelectionSchema,
    inputStereo: channelSelectionSchema,
    outputMono: channelSelectionSchema,
    outputStereo: channelSelectionSchema,
  })
  .strict()
const deviceCapabilitiesRequestSchema = z
  .object({
    host: z.string().min(1),
    inputDeviceId: z.string().min(1).nullable(),
    outputDeviceId: z.string().min(1).nullable(),
  })
  .strict()
const deviceCapabilitiesSchema = z
  .object({
    host: z.string(),
    inputDeviceId: z.string().min(1).nullable(),
    outputDeviceId: z.string().min(1).nullable(),
    inputChannelNames: z.array(z.string()),
    outputChannelNames: z.array(z.string()),
    sampleRates: z.array(finite.positive()),
    bufferSizes: z.array(counter.positive()),
    defaultSampleRate: finite.nonnegative(),
    defaultBufferFrames: counter,
    separateInputOutput: z.boolean(),
    controlPanel: z.boolean(),
  })
  .strict()
const deviceSchema = z
  .object({
    state: z.enum(["closed", "ready", "error"]),
    host: z.string(),
    deviceId: z.string().nullable(),
    deviceName: z.string().nullable(),
    sampleRate: finite.nonnegative(),
    bufferFrames: counter,
    outputChannels: counter,
    devices: z.array(deviceInfoSchema),
    hosts: z.array(hostSchema),
    inputDevices: z.array(deviceInfoSchema),
    outputDevices: z.array(deviceInfoSchema),
    configuration: deviceConfigurationSchema.nullable(),
    capabilities: deviceCapabilitiesSchema,
    inputDeviceId: z.string().nullable(),
    inputDeviceName: z.string().nullable(),
    inputChannels: counter,
    inputLatencyFrames: counter,
    outputLatencyFrames: counter,
    error: z.string().nullable(),
  })
  .strict()
const clockFields = { bar: finite.min(1), barsPerSecond: finite.nonnegative() }
const telemetrySchema = z
  .object({
    sessionId: z.string(),
    sequence: counter,
    appliedSequence: counter,
    controlGeneration: generation,
    clock: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("musical"), ...clockFields }).strict(),
      z
        .object({
          kind: z.literal("sample"),
          ...clockFields,
          frame: counter,
          sampleRate: finite.positive(),
        })
        .strict(),
    ]),
    playing: z.boolean(),
    recording: z.boolean(),
    levels: z.record(z.string(), z.tuple([finite, finite])),
  })
  .strict()
const resultSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("accepted"),
      sessionId: z.string(),
      sequence: counter,
      revision: counter,
      controlGeneration: generation,
    })
    .strict(),
  z
    .object({
      kind: z.literal("rejected"),
      sessionId: z.string(),
      sequence: counter,
      code: z.enum(["rejected", "connection", "protocol", "disposed", "superseded-open"]),
      controlGeneration: generation,
    })
    .strict(),
])
const noteResultSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("accepted"), sessionId: z.string(), sequence: counter.positive() })
    .strict(),
  z
    .object({
      kind: z.literal("rejected"),
      sessionId: z.string(),
      sequence: counter.positive(),
      code: z.enum(["rejected", "connection", "protocol", "disposed", "note-overrun"]),
    })
    .strict(),
])
const snapshotSchema = z
  .object({
    telemetry: telemetrySchema.nullable(),
    device: deviceSchema,
    issues: z.array(
      z
        .object({
          code: z.string(),
          message: z.string(),
          sourceId: z.string().optional(),
          trackId: z.string().optional(),
          clipId: z.string().optional(),
        })
        .strict()
    ),
  })
  .strict()
const auditionRequestSchema = z
  .discriminatedUnion("mode", [
    z
      .object({
        generation: counter,
        path: z.string().min(1),
        mode: z.literal("raw"),
        gainDb: finite,
      })
      .strict(),
    z
      .object({
        generation: counter,
        path: z.string().min(1),
        mode: z.literal("sync"),
        sourceBpm: finite.positive().nullable(),
        projectBpm: finite.positive(),
        numerator: z.number().int().positive(),
        denominator: z.number().int().positive(),
        gainDb: finite,
      })
      .strict(),
  ])
  .refine(
    value => value.mode !== "sync" || value.sourceBpm !== null,
    "Source BPM is required for synchronized audition"
  )
const auditionResultSchema = z
  .object({
    generation: counter,
    durationSeconds: finite.nonnegative(),
    waveform: z.array(finite.min(0).max(1)).max(4096).optional(),
    state: z.enum(["playing", "waitingForBar"]),
  })
  .strict()
const auditionStatusSchema = z
  .object({
    generation: counter,
    positionSeconds: finite.nonnegative(),
    durationSeconds: finite.nonnegative(),
    playing: z.boolean(),
  })
  .strict()
const tempoAnalysisSchema = z.discriminatedUnion("origin", [
  z.object({ origin: z.literal("metadata"), bpm: finite.min(30).max(300) }).strict(),
  z.object({ origin: z.literal("analysis"), bpm: finite.min(30).max(300) }).strict(),
  z.object({ origin: z.literal("unknown"), bpm: z.null() }).strict(),
])
const waveformSchema = z
  .object({ durationSeconds: finite.nonnegative(), peaks: z.array(finite.min(0).max(1)).max(4096) })
  .strict()
const recordingSourceSchema = z
  .custom<MediaSource>(isMediaSource)
  .refine(
    source => source.location.kind === "external" && source.frames > 0 && source.byteLength > 0,
    "Recording sources must contain inspected external audio"
  )
const recordingSchema = z
  .object({
    recordingId: z.string().min(1),
    sessionId: z.string().min(1),
    sourceBpm: finite.positive().max(999),
    sources: z.array(recordingSourceSchema).min(1),
    clips: z
      .array(
        z
          .object({
            clipId: z.string().min(1),
            fileId: z.string().min(1),
            trackId: z.string().min(1),
            startBar: finite.min(1),
            durationBars: finite.positive(),
            sourceOffsetBars: finite.nonnegative(),
          })
          .strict()
      )
      .min(1),
  })
  .strict()
  .superRefine((recording, context) => {
    const sourceIds = new Set(recording.sources.map(source => source.id))
    if (
      sourceIds.size !== recording.sources.length ||
      new Set(recording.clips.map(clip => clip.clipId)).size !== recording.clips.length ||
      recording.clips.some(clip => !sourceIds.has(clip.fileId))
    ) {
      context.addIssue({ code: "custom", message: "Invalid recording source or clip identity" })
    }
  })
const recordingResultsSchema = z
  .object({
    sessionId: z.string().min(1),
    recordings: z.array(recordingSchema),
  })
  .strict()
  .superRefine((result, context) => {
    if (
      result.recordings.some(recording => recording.sessionId !== result.sessionId) ||
      new Set(result.recordings.map(recording => recording.recordingId)).size !==
        result.recordings.length
    ) {
      context.addIssue({ code: "custom", message: "Invalid recording result session or identity" })
    }
  })
export type NativeRecording = z.infer<typeof recordingSchema>
export type NativeRecordingResults = z.infer<typeof recordingResultsSchema>
export type AudioDeviceInfo = z.infer<typeof deviceInfoSchema>
export type AudioHost = z.infer<typeof hostSchema>
export type AudioDeviceConfiguration = z.infer<typeof deviceConfigurationSchema>
export type AudioDeviceCapabilities = z.infer<typeof deviceCapabilitiesSchema>
export type AudioDeviceCapabilitiesRequest = z.infer<typeof deviceCapabilitiesRequestSchema>
export type AudioDeviceSnapshot = z.infer<typeof deviceSchema>
export type PlaybackSnapshot = z.infer<typeof snapshotSchema>
export type NativeAuditionRequest = z.infer<typeof auditionRequestSchema>
export type NativeAuditionResult = z.infer<typeof auditionResultSchema>
export type NativeAuditionStatus = z.infer<typeof auditionStatusSchema>
export type NativeTempoAnalysis = z.infer<typeof tempoAnalysisSchema>
export type NativePlaybackResult = z.infer<typeof resultSchema>
export type NativeNoteResult = z.infer<typeof noteResultSchema>

export interface NativeAudioPort {
  available(): boolean
  acquire(leaseId: string, sessionId: string): Promise<void>
  apply(request: unknown, leaseId: string, stopToken: number): Promise<NativePlaybackResult>
  control(request: unknown, leaseId: string, stopToken: number): Promise<NativePlaybackResult>
  note(request: unknown, leaseId: string, stopToken: number): Promise<NativeNoteResult>
  allNotesOff(leaseId: string, sessionId: string, throughSequence: number): Promise<void>
  telemetry(leaseId: string): Promise<PlaybackSnapshot>
  recordingResults(leaseId: string, sessionId: string): Promise<NativeRecordingResults>
  recordingAck(
    leaseId: string,
    sessionId: string,
    recordingId: string,
    acceptedRevision: number
  ): Promise<void>
  release(leaseId: string): Promise<void>
  stop(leaseId: string, sessionId: string, stopToken: number): Promise<void>
  reserveAudition(): Promise<number>
  audition(request: NativeAuditionRequest): Promise<NativeAuditionResult>
  stopAudition(generation: number): Promise<void>
  seekAudition(generation: number, normalized: number): Promise<void>
  auditionStatus(generation: number): Promise<NativeAuditionStatus>
  analyzeTempo(path: string): Promise<NativeTempoAnalysis>
  devices(): Promise<AudioDeviceSnapshot>
  deviceCapabilities(request: AudioDeviceCapabilitiesRequest): Promise<AudioDeviceCapabilities>
  configureDevice(request: AudioDeviceConfiguration): Promise<AudioDeviceSnapshot>
  openDeviceControlPanel(): Promise<AudioDeviceSnapshot>
}
function requireNative() {
  if (!isTauri()) throw new Error("Native audio playback is unavailable in the web browser")
}
async function command(name: string, args?: Record<string, unknown>): Promise<unknown> {
  requireNative()
  return invoke(name, args)
}
async function voidCommand(name: string, args: Record<string, unknown>): Promise<void> {
  z.null().parse(await command(name, args))
}
export const nativeAudio: NativeAudioPort = {
  available: isTauri,
  acquire: (leaseId, sessionId) => voidCommand("playback_acquire", { leaseId, sessionId }),
  apply: async (request, leaseId, stopToken) =>
    resultSchema.parse(
      await command("playback_apply", { request, leaseId, stopToken: counter.parse(stopToken) })
    ),
  control: async (request, leaseId, stopToken) =>
    resultSchema.parse(
      await command("playback_control", {
        request: controlRequestSchema.parse(request),
        leaseId,
        stopToken: counter.parse(stopToken),
      })
    ),
  note: async (request, leaseId, stopToken) =>
    noteResultSchema.parse(
      await command("playback_note", {
        request: noteRequestSchema.parse(request),
        leaseId,
        stopToken: counter.parse(stopToken),
      })
    ),
  allNotesOff: (leaseId, sessionId, throughSequence) =>
    voidCommand("playback_all_notes_off", {
      leaseId,
      sessionId,
      throughSequence: counter.parse(throughSequence),
    }),
  telemetry: async leaseId =>
    snapshotSchema.parse(await command("playback_telemetry", { leaseId })),
  recordingResults: async (leaseId, sessionId) =>
    recordingResultsSchema.parse(await command("recording_results", { leaseId, sessionId })),
  recordingAck: (leaseId, sessionId, recordingId, acceptedRevision) =>
    voidCommand("recording_ack", {
      leaseId,
      sessionId,
      recordingId,
      acceptedRevision: counter.parse(acceptedRevision),
    }),
  release: leaseId => voidCommand("playback_release", { leaseId }),
  stop: (leaseId, sessionId, stopToken) =>
    voidCommand("playback_stop", { leaseId, sessionId, stopToken: counter.parse(stopToken) }),
  reserveAudition: async () => counter.positive().parse(await command("playback_audition_reserve")),
  audition: async request =>
    auditionResultSchema.parse(
      await command("playback_audition", { request: auditionRequestSchema.parse(request) })
    ),
  stopAudition: generation =>
    voidCommand("playback_audition_stop", { generation: counter.parse(generation) }),
  seekAudition: (generation, normalized) =>
    voidCommand("playback_audition_seek", {
      generation: counter.parse(generation),
      normalized: finite.min(0).max(1).parse(normalized),
    }),
  auditionStatus: async generation =>
    auditionStatusSchema.parse(
      await command("playback_audition_status", {
        generation: counter.parse(generation),
      })
    ),
  analyzeTempo: async path =>
    tempoAnalysisSchema.parse(
      await command("playback_analyze_tempo", {
        path: z.string().min(1).parse(path),
      })
    ),
  devices: async () => deviceSchema.parse(await command("playback_devices")),
  deviceCapabilities: async request =>
    deviceCapabilitiesSchema.parse(
      await command("playback_device_capabilities", {
        request: deviceCapabilitiesRequestSchema.parse(request),
      })
    ),
  configureDevice: async request =>
    deviceSchema.parse(
      await command("playback_configure_device", {
        request: deviceConfigurationSchema.parse(request),
      })
    ),
  openDeviceControlPanel: async () =>
    deviceSchema.parse(await command("playback_device_control_panel")),
}
const waveformQueue = { pending: Promise.resolve() }
export function readNativeWaveform(path: string, bins = 512) {
  const args = {
    path: z.string().min(1).parse(path),
    bins: z.number().int().min(1).max(4096).parse(bins),
  }
  const result = waveformQueue.pending.then(async () =>
    waveformSchema.parse(await command("playback_waveform", args))
  )
  waveformQueue.pending = result.then(() => {}).catch(() => {})
  return result
}
export async function readNativeWaveformRange(
  request: WaveformRangeRequest
): Promise<WaveformRange> {
  const valid = waveformRangeRequestSchema.parse(request)
  const result = waveformRangeSchema.parse(
    await command("playback_waveform_range", { request: valid })
  )
  const frameCount = Math.min(valid.frameCount, result.totalFrames - valid.startFrame)
  const samples = valid.framesPerBin === 1
  if (
    result.startFrame !== valid.startFrame ||
    result.frameCount !== frameCount ||
    (result.kind === "samples") !== samples
  ) {
    throw new Error("Native waveform range does not match its request")
  }
  if (
    result.kind === "envelope" &&
    (result.framesPerBin !== valid.framesPerBin ||
      result.channels.some(
        channel => channel.min.length !== Math.ceil(frameCount / valid.framesPerBin)
      ))
  ) {
    throw new Error("Native waveform envelope must match requested columns")
  }
  return result
}
export function cancelNativeWaveformRanges(): Promise<void> {
  return voidCommand("playback_waveform_range_cancel", {})
}
export interface NativeAudioStatus {
  device: AudioDeviceSnapshot | null
  issues: PlaybackSnapshot["issues"]
  error: string | null
}
const audioState: { status: NativeAudioStatus } = {
  status: { device: null, issues: [], error: null },
}
const statusListeners = new Set<() => void>()
export const readNativeAudioStatus = () => audioState.status
export function subscribeNativeAudioStatus(listener: () => void) {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}
export function publishNativeAudioStatus(next: Partial<NativeAudioStatus>) {
  audioState.status = { ...audioState.status, ...next }
  for (const listener of statusListeners) listener()
}
export function audioErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message
  return "Native audio operation failed"
}
