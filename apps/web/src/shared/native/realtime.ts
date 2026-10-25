import { Channel, invoke, isTauri } from "@tauri-apps/api/core"
import {
  meterRegistrySchema,
  meterResetBaselineSchema,
  realtimeEventSchema,
  realtimeStreamOpenResultSchema,
  clockProbeSchema,
} from "@zoeydaw/project-core/realtime"
import type { MeterSessionPort } from "@zoeydaw/project-runtime/realtime"
import { z } from "zod"

const eventBatchSchema = z.array(realtimeEventSchema).min(1).max(64)
const channels = new Map<number, Channel<unknown>>()

function requireNative(): void {
  if (!isTauri()) throw new Error("Native meter streaming is unavailable in the web browser")
}

async function command(name: string, args: Record<string, unknown>): Promise<unknown> {
  requireNative()
  return invoke<unknown>(name, args)
}

async function voidCommand(name: string, args: Record<string, unknown>): Promise<void> {
  z.null().parse(await command(name, args))
}

function detach(channel: Channel<unknown>): void {
  channel.onmessage = () => {}
}

export const nativeMeterPort = {
  available: isTauri,
  async open(leaseId, sessionId, events, onError) {
    requireNative()
    let active = true
    let callbackFailed = false
    let callbackError: unknown
    const channel = new Channel<unknown>(value => {
      if (!active) return
      try {
        events(eventBatchSchema.parse(value))
      } catch (error) {
        callbackFailed = true
        callbackError = error
        active = false
        detach(channel)
        try {
          onError(error)
        } catch {
          // Channel callbacks must not throw into Tauri's event dispatcher.
        }
      }
    })

    let rawAdmission: unknown
    try {
      rawAdmission = await invoke<unknown>("playback_stream_open", {
        leaseId,
        sessionId,
        events: channel,
      })
    } catch (error) {
      active = false
      detach(channel)
      throw error
    }

    const streamId = z
      .number()
      .int()
      .min(1)
      .max(0xffff_ffff)
      .safeParse(
        typeof rawAdmission === "object" && rawAdmission !== null && "streamId" in rawAdmission
          ? rawAdmission.streamId
          : undefined
      )
    try {
      const opened = realtimeStreamOpenResultSchema.parse(rawAdmission)
      meterRegistrySchema.parse(opened.registry)
      if (!streamId.success || opened.registry.sessionId !== sessionId)
        throw new Error("Invalid meter stream admission")
      if (callbackFailed) throw callbackError
      channels.set(opened.streamId, channel)
      return opened
    } catch (error) {
      active = false
      detach(channel)
      if (streamId.success) {
        try {
          await voidCommand("playback_stream_close", { streamId: streamId.data })
        } catch (closeError) {
          throw new AggregateError([error, closeError], "Meter stream admission and cleanup failed")
        }
      }
      throw error
    }
  },
  async registry(streamId) {
    return meterRegistrySchema.parse(await command("playback_stream_registry", { streamId }))
  },
  async clock(streamId) {
    return clockProbeSchema.nullable().parse(await command("playback_clock_probe", { streamId }))
  },
  async interest(interest) {
    await voidCommand("playback_meter_interest", { interest })
  },
  async snapshot(streamId, afterSeq) {
    const value = await command("playback_meter_snapshot", { streamId, afterSeq })
    if (!(value instanceof ArrayBuffer))
      throw new Error("Meter snapshot did not return raw ArrayBuffer")
    return value
  },
  async receipt(streamId, throughSeq) {
    await voidCommand("playback_event_receipt", { streamId, throughSeq })
  },
  async reset(streamId, endpointIds, reset) {
    return meterResetBaselineSchema.parse(
      await command("playback_meter_reset", { streamId, endpointIds, reset })
    )
  },
  async close(streamId) {
    const channel = channels.get(streamId)
    if (channel) {
      detach(channel)
      channels.delete(streamId)
    }
    await voidCommand("playback_stream_close", { streamId })
  },
} satisfies MeterSessionPort & { available: typeof isTauri }
