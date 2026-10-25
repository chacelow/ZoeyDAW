// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import type { NativeAuditionResult, NativeAuditionStatus } from "@/shared/native/audio"
import { createNativeBrowserAuditionPort } from "./native"
import { audioPort, deferred } from "./native.testing"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
describe("native Browser audition", () => {
  it("reserves from the retained native owner after the WebView module reloads", async () => {
    const port = audioPort(500)
    const first = createNativeBrowserAuditionPort(port)
    await first.select("/before-reload.wav")
    vi.resetModules()
    // A static import cannot recreate the WebView's discarded module state.
    const reloaded = await import("./native")
    const second = reloaded.createNativeBrowserAuditionPort(port)
    await second.select("/after-reload.wav")
    expect(port.audition.mock.calls.map(([request]) => request.generation)).toEqual([501, 502])
    expect(port.reserveAudition).toHaveBeenCalledTimes(2)
  })

  it("does not let an older reservation response replace the latest selection", async () => {
    const port = audioPort(1)
    const firstReservation = deferred<number>()
    port.reserveAudition.mockReturnValueOnce(firstReservation.promise)
    const audition = createNativeBrowserAuditionPort(port)
    const first = audition.select("/first.wav").catch(error => error)
    await audition.select("/latest.wav")
    firstReservation.resolve(1)
    expect(await first).toMatchObject({ name: "AbortError" })
    expect(port.audition).toHaveBeenCalledTimes(1)
    expect(port.audition).toHaveBeenCalledWith({
      generation: 2,
      path: "/latest.wav",
      mode: "raw",
      gainDb: -18,
    })
    expect(await audition.readStatus()).toMatchObject({ playing: true })
  })

  it("cancels selection before reservation resolves and reserves a native stop fence", async () => {
    const port = audioPort(1)
    const reservation = deferred<number>()
    port.reserveAudition.mockReturnValueOnce(reservation.promise)
    const audition = createNativeBrowserAuditionPort(port)
    const selecting = audition.select("/pending-reservation.wav").catch(error => error)
    const stopping = audition.stop()
    expect(port.reserveAudition).toHaveBeenCalledTimes(1)
    reservation.resolve(1)
    await stopping
    expect(await selecting).toMatchObject({ name: "AbortError" })
    expect(port.reserveAudition).toHaveBeenCalledTimes(2)
    expect(port.stopAudition).toHaveBeenCalledWith(2)
    expect(port.audition).not.toHaveBeenCalled()
    expect(await audition.readStatus()).toMatchObject({ playing: false })
  })

  it("orders a replacement selection after an already pending stop reservation", async () => {
    const port = audioPort()
    const pendingAudition = deferred<NativeAuditionResult>()
    const stopReservation = deferred<number>()
    const stopReserving = deferred<undefined>()
    port.audition.mockReturnValueOnce(pendingAudition.promise)
    port.reserveAudition
      .mockResolvedValueOnce(1)
      .mockImplementationOnce(() => {
        stopReserving.resolve(undefined)
        return stopReservation.promise
      })
      .mockResolvedValueOnce(3)
    const old = createNativeBrowserAuditionPort(port)
    const current = createNativeBrowserAuditionPort(port)
    const selecting = old.select("/old.wav").catch(error => error)
    await Promise.resolve()
    const stopping = old.stop()
    await stopReserving.promise
    const replacement = current.select("/replacement.wav")
    expect(port.reserveAudition).toHaveBeenCalledTimes(2)
    stopReservation.resolve(2)
    await stopping
    await replacement
    pendingAudition.resolve({ generation: 1, durationSeconds: 3, state: "playing" })
    expect(await selecting).toMatchObject({ name: "AbortError" })
    expect(port.audition.mock.calls.map(([request]) => request.generation)).toEqual([1, 3])
    await old.stop()
    expect(port.stopAudition).not.toHaveBeenCalled()
    expect(await current.readStatus()).toMatchObject({ playing: true })
  })

  it("does not let a pending old port stop reserve over its replacement", async () => {
    const port = audioPort(1)
    const reservation = deferred<number>()
    port.reserveAudition.mockReturnValueOnce(reservation.promise)
    const old = createNativeBrowserAuditionPort(port)
    const current = createNativeBrowserAuditionPort(port)
    const selecting = old.select("/old.wav").catch(error => error)
    const stopping = old.stop()
    const replacement = current.select("/replacement.wav")
    reservation.resolve(1)
    await stopping
    await replacement
    expect(await selecting).toMatchObject({ name: "AbortError" })
    expect(port.reserveAudition).toHaveBeenCalledTimes(2)
    expect(port.stopAudition).not.toHaveBeenCalled()
    expect(port.audition.mock.calls.map(([request]) => request.generation)).toEqual([2])
  })

  it("selects original-speed audio with the newest native source identity", async () => {
    const port = audioPort()
    const first = deferred<NativeAuditionResult>()
    port.audition.mockReturnValueOnce(first.promise)
    const audition = createNativeBrowserAuditionPort(port)
    const stale = audition.select("/first.wav").catch(error => error)
    await Promise.resolve()
    const selected = await audition.select("/second.wav")
    const oldGeneration = port.audition.mock.calls[0][0].generation
    const currentGeneration = port.audition.mock.calls[1][0].generation
    expect(selected.source).toEqual({ kind: "preview", clipId: `preview/${currentGeneration}` })
    expect(currentGeneration).toBeGreaterThan(oldGeneration)
    expect(port.audition.mock.calls[1][0]).toEqual({
      generation: currentGeneration,
      path: "/second.wav",
      mode: "raw",
      gainDb: -18,
    })
    expect(port.analyzeTempo).not.toHaveBeenCalled()
    first.resolve({ generation: oldGeneration, durationSeconds: 2, state: "playing" })
    expect(await stale).toMatchObject({ name: "AbortError" })
    expect(await audition.readStatus()).toEqual({
      durationSeconds: 3,
      playing: true,
    })
    await audition.stop()
    expect(port.stopAudition).toHaveBeenCalledWith(currentGeneration)
    await audition.seek(0.75)
    expect(port.seekAudition).toHaveBeenCalledWith(currentGeneration, 0.75)
  })

  it("fences a stopped pending selection and rejects seek before a successful select", async () => {
    const port = audioPort()
    const pending = deferred<NativeAuditionResult>()
    port.audition.mockReturnValueOnce(pending.promise)
    const audition = createNativeBrowserAuditionPort(port)
    const selecting = audition.select("/raw.wav").catch(error => error)
    await Promise.resolve()
    const generation = port.audition.mock.calls[0][0].generation
    await expect(audition.seek(0.5)).rejects.toThrow("Select a preview source")
    await audition.stop()
    expect(port.stopAudition.mock.calls[0][0]).toBeGreaterThan(generation)
    pending.resolve({ generation, durationSeconds: 2, state: "playing" })
    expect(await selecting).toMatchObject({ name: "AbortError" })
    expect(await audition.readStatus()).toEqual({
      durationSeconds: 0,
      playing: false,
    })
    expect(port.seekAudition).not.toHaveBeenCalled()
  })

  it("rejects late status after replacement, stop, and seek, and exposes command errors", async () => {
    const port = audioPort()
    const audition = createNativeBrowserAuditionPort(port)
    await audition.select("/first.wav")
    for (const action of [
      () => audition.select("/next.wav"),
      () => audition.stop(),
      () => audition.seek(0.5),
    ]) {
      const pending = deferred<NativeAuditionStatus>()
      port.auditionStatus.mockReturnValueOnce(pending.promise)
      const reading = audition.readStatus().catch(error => error)
      const generation = port.auditionStatus.mock.lastCall![0]
      await action()
      pending.resolve({ generation, positionSeconds: 2, durationSeconds: 3, playing: true })
      expect(await reading).toMatchObject({ name: "AbortError" })
    }
    port.auditionStatus.mockRejectedValueOnce(new Error("Device disconnected"))
    await expect(audition.readStatus()).rejects.toThrow("Device disconnected")
    port.audition.mockRejectedValueOnce(new Error("Audition file is offline"))
    await expect(audition.select("/missing.wav")).rejects.toThrow("offline")
  })

  it("does not let an obsolete adapter stop a newer preview selection", async () => {
    const port = audioPort()
    const old = createNativeBrowserAuditionPort(port)
    const current = createNativeBrowserAuditionPort(port)
    await old.select("/old.wav")
    await current.select("/current.wav")
    await old.stop()
    expect(port.stopAudition).not.toHaveBeenCalled()
    expect(await current.readStatus()).toMatchObject({ playing: true })
  })
})
