import { afterEach, expect, it } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { useLayoutEffect } from "react"
import type { ReactNode } from "react"
import { createTestRoot } from "@gpuix/react/testing"
import type { TestRoot } from "@gpuix/react/testing"
import {
  configureProjectBackend,
  hydrateProject,
  readProjectPeaks,
  startProjectRuntime,
  whenProjectBackendIdle,
} from "@/project/adapters"
import { createNativeBackend } from "@/project/adapters/backend/native"
import { createMockDocument, createMockWorkspace } from "@/project/adapters/fixtures"
import { createTrack } from "@/project/model/reducers"
import { DEFAULT_TRACK_HEIGHT } from "@/project/layout"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import type { Appearance, Theme } from "@/shared/theme/ThemeProvider"
import { resolveContentColor } from "@/shared/theme/content-color"
import { decodeNativePng } from "@/shared/waveform/testing/native-png"
import type { NativePng } from "@/shared/waveform/testing/native-png"
import { SourceWaveform } from "@/project/sections/clip-edit/audio/SourceWaveform"
import { createSceneStore } from "../core/scene"
import { ClipCardView } from "./ClipCard"
import { createClipCardProjection } from "./clip-card-projection"

let root: TestRoot | undefined
let directory: string | undefined
let release: (() => void) | undefined
let restore: (() => void) | undefined
afterEach(() => {
  root?.unmount()
  root = undefined
  release?.()
  release = undefined
  restore?.()
  restore = undefined
  if (directory) rmSync(directory, { recursive: true, force: true })
  directory = undefined
})

function ThemeProbe({ onTheme }: { onTheme: (theme: Theme) => void }) {
  const theme = useTheme()
  useLayoutEffect(() => onTheme(theme), [onTheme, theme])
  return null
}

function pixel(image: NativePng, x: number, y: number): Buffer {
  const offset = (y * image.width + x) * 4
  return image.rgba.subarray(offset, offset + 4)
}

function envelope(image: NativePng, x: number, top: number, height: number, ink: Buffer): number[] {
  let first = -1
  let last = -1
  for (let y = Math.ceil(top); y < top + height; y++) {
    if (!pixel(image, x, y).equals(ink)) continue
    if (first < 0) first = y
    last = y
  }
  return [first, last]
}

const appearances: Appearance[] = ["dark", "light"]
for (const appearance of appearances)
  it(`native probe fixture retains stereo envelopes and lane clip ink in ${appearance}`, async () => {
    const samplePath = fileURLToPath(
      new URL("../../../../../../../crates/engine/spikes/assets/probe.wav", import.meta.url)
    )
    const document = createMockDocument()
    const main = document.tracks.find(track => track.kind === "main")
    if (!main) throw new Error("Missing Main output")
    const audio = createTrack("audio", [main], undefined, DEFAULT_TRACK_HEIGHT * 2)
    audio.id = "native-audio"
    audio.name = "Native audio fixture"
    audio.clips = [
      {
        id: "native-audio-clip",
        kind: "audio",
        label: "Real source",
        startBar: 1,
        lengthBars: 4,
        samplePath,
        gainDb: 0,
      },
    ]
    document.tracks = [audio, main]
    const workspace = {
      ...createMockWorkspace(),
      pxPerBar: 64,
      scrollX: 0,
      scrollY: 0,
      automationMode: false,
    }
    restore = configureProjectBackend(createNativeBackend)
    hydrateProject(JSON.stringify({ version: 2, document, workspace }))
    release = startProjectRuntime()
    expect(await whenProjectBackendIdle()).toBe(true)
    root = createTestRoot({ width: 1280, height: 800 })
    directory = mkdtempSync(path.join(tmpdir(), "native-probe-waveform-"))
    let capturedTheme: Theme | undefined
    root.render(
      <ThemeProvider appearance={appearance}>
        <ThemeProbe
          onTheme={theme => {
            capturedTheme = theme
          }}
        />
      </ThemeProvider>
    )
    if (!capturedTheme) throw new Error("Missing fixture theme")
    const theme = capturedTheme
    const scene = createSceneStore()
    scene.setMusic({
      bars: 128,
      grid: workspace.grid,
      transport: document.transport,
      tracks: document.tracks,
      markers: [],
      loop: document.transport.loop,
    })
    scene.setViewport({ width: 1280, height: 800, scrollX: 0, scrollY: 0, pxPerBar: 64, dpr: 1 })
    const card = createClipCardProjection()(
      scene.get(),
      { track: audio, top: 0, height: audio.heightPx },
      false
    )[0]
    if (!card) throw new Error("Missing native fixture Clip")
    const g = card.geometry
    const columns = g.width
    const peaks = readProjectPeaks(samplePath, 1, 5, columns, 0)
    expect(peaks.length).toBe(columns * 4)
    const capture = (content: ReactNode, name: string) => {
      if (!root || !directory) throw new Error("Native fixture root is closed")
      root.render(
        <ThemeProvider appearance={appearance}>
          <div
            style={{
              width: 1280,
              height: 800,
              position: "relative",
              backgroundColor: theme.colors.arrangementSurface,
            }}
          >
            {content}
          </div>
        </ThemeProvider>
      )
      const filename = path.join(directory, `${name}.png`)
      root.renderer.captureScreenshot(filename)
      return decodeNativePng(readFileSync(filename))
    }
    const lane = capture(
      <ClipCardView
        card={card}
        trackColor={audio.color}
        viewportWidth={1280}
        numerator={document.transport.numerator}
        automationMode={false}
        readPeaks={readProjectPeaks}
        onActivate={() => {}}
      />,
      "lane"
    )
    const channelHeight = g.bodyHeight / 2
    const actualInk = pixel(lane, 128, Math.floor(g.bodyTop + channelHeight / 2))
    const sourceInk = pixel(
      capture(
        <div
          style={{
            width: 1,
            height: 1,
            backgroundColor: resolveContentColor(audio.color, theme.colors),
          }}
        />,
        "source-ink"
      ),
      0,
      0
    )
    const laneInk = pixel(
      capture(
        <div style={{ width: 1, height: 1, backgroundColor: theme.colors.arrangementClipInk }} />,
        "lane-ink"
      ),
      0,
      0
    )
    const referenceColumns = (inset: number, top: number) => {
      const elements: ReactNode[] = []
      const amplitude = channelHeight / 2 - inset
      for (let channel = 0; channel < 2; channel++)
        for (let x = 0; x < columns; x++) {
          const pair = 2 * (channel * columns + x)
          const low = peaks[pair] ?? 0
          const high = peaks[pair + 1] ?? 0
          elements.push(
            <div
              key={`${channel}:${x}`}
              style={{
                position: "absolute",
                left: x,
                top: top + channel * channelHeight + channelHeight / 2 - high * amplitude,
                width: 1,
                height: Math.max(1, (high - low) * amplitude),
                backgroundColor: "#fff",
              }}
            />
          )
        }
      return elements
    }
    const laneReference = capture(
      referenceColumns(theme.project.arrangementWaveformInset, g.bodyTop),
      "lane-reference"
    )
    const white = Buffer.from([255, 255, 255, 255])
    for (let channel = 0; channel < 2; channel++)
      for (let x = 8; x < columns; x += 16) {
        const top = g.bodyTop + channel * channelHeight
        expect(envelope(lane, x, top, channelHeight, actualInk)).toEqual(
          envelope(laneReference, x, top, channelHeight, white)
        )
      }
    const source = capture(
      <SourceWaveform
        sourceId={samplePath}
        view={{ start: 0, span: 4 }}
        window={{ start: 0, end: 4 }}
        width={columns}
        height={g.bodyHeight}
        gain={1}
        reverse={false}
        color={resolveContentColor(audio.color, theme.colors)}
        readPeaks={readProjectPeaks}
      />,
      "source"
    )
    const sourceReference = capture(referenceColumns(0, 0), "source-reference")
    for (let channel = 0; channel < 2; channel++)
      for (let x = 8; x < columns; x += 16) {
        const top = channel * channelHeight
        expect(envelope(source, x, top, channelHeight, sourceInk)).toEqual(
          envelope(sourceReference, x, top, channelHeight, white)
        )
      }
    expect(actualInk).toEqual(laneInk)
  })
