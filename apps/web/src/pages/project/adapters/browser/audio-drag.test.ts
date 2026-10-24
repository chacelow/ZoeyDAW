// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest"
import { browserAudioDrag } from "./audio-drag"

afterEach(() => {
  browserAudioDrag.clear()
  browserAudioDrag.setPreviewMetadata(null)
})

it("uses only measured metadata for the same source path", () => {
  browserAudioDrag.setPreviewMetadata({ path: "/Voice.wav", durationSeconds: 5 })
  const source = browserAudioDrag.start({
    path: "/Voice.wav",
    name: "Voice.wav",
    durationSeconds: null,
  })
  expect(source.durationSeconds).toBe(5)
  expect(
    browserAudioDrag.start({ path: "/Other.wav", name: "Other.wav", durationSeconds: null })
      .durationSeconds
  ).toBeNull()
})

it.each([NaN, Infinity, 0, -1])(
  "never turns invalid duration %s into a pretend clip length",
  durationSeconds => {
    browserAudioDrag.setPreviewMetadata({ path: "/Voice.wav", durationSeconds })
    expect(
      browserAudioDrag.start({ path: "/Voice.wav", name: "Voice.wav", durationSeconds })
        .durationSeconds
    ).toBeNull()
  }
)

it("rejects cancelled or stale DataTransfer session tokens", () => {
  const source = browserAudioDrag.start({
    path: "/Voice.wav",
    name: "Voice.wav",
    durationSeconds: 5,
  })
  expect(browserAudioDrag.read(source.token)).toEqual(source)
  expect(browserAudioDrag.read('{"path":"/injected.wav"}')).toBeNull()
  browserAudioDrag.clear()
  expect(browserAudioDrag.read(source.token)).toBeNull()
  const next = browserAudioDrag.start({
    path: source.path,
    name: source.name,
    durationSeconds: null,
  })
  expect(browserAudioDrag.read(source.token)).toBeNull()
  expect(browserAudioDrag.read(next.token)).toEqual(next)
})
