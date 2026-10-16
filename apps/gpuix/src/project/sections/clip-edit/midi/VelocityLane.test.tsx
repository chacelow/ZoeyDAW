import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { VelocityLane } from "./VelocityLane"
import { clipEditorLabels as demoLabels } from "@/app/locales/sections/clip-edit"
import type { MidiNote } from "@/project/model/types"

const notes: readonly MidiNote[] = [
  { id: "velocity-boundary", pitch: 60, startBeat: 20, lengthBeats: 10, velocity: 63.5 },
]
const noop = () => {}
function Surface({ x, reference }: { x: number; reference: boolean }) {
  const theme = useTheme()
  return (
    <div
      style={{
        width: 80,
        height: 40,
        flexDirection: "row",
        overflow: "hidden",
        backgroundColor: theme.colors.arrangementSurfaceAlt,
      }}
    >
      {reference ? (
        <>
          <div
            style={{
              position: "absolute",
              left: x,
              top: 20,
              width: 1,
              height: 20,
              backgroundColor: "#f08040",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: x - 2,
              top: 18,
              width: 4,
              height: 4,
              backgroundColor: "#f08040",
            }}
          />
        </>
      ) : (
        <VelocityLane
          formats={demoLabels.en.midi.formats}
          hostRef={null}
          roll={{
            pitches: [60],
            rowHeight: 18,
            width: 100,
            scrollX: 20 - x,
            scrollY: 0,
            viewWidth: 80,
            viewHeight: 40,
            window: { sourceOffsetBeats: 0, totalBeats: 100 },
          }}
          readNotes={() => notes}
          selection={[]}
          currentNoteIndex={null}
          label="Velocity"
          color="#f08040"
          onMouseDown={noop}
          onMouseMove={noop}
          onMouseUp={noop}
          onVelocityChange={noop}
          onActivateNote={noop}
        />
      )}
    </div>
  )
}

test("velocity handles retain their four-pixel footprint at interior and clipped viewport edges", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "zoeydaw-velocity-size-"))
  try {
    const positions = [20, -1, 81, -5, 85]
    for (const reference of [false, true]) {
      const root = createTestRoot({ width: 80, height: 40 })
      try {
        for (const [index, x] of positions.entries()) {
          root.render(
            <ThemeProvider>
              <Surface x={x} reference={reference} />
            </ThemeProvider>
          )
          const file = path.join(directory, `${index}-${reference}.png`)
          root.renderer.captureScreenshot(file)
          if (reference)
            expect(
              readFileSync(file).equals(readFileSync(path.join(directory, `${index}-false.png`)))
            ).toBe(true)
        }
      } finally {
        root.unmount()
      }
      expect(root.renderer.getRetainedElementCount()).toBe(0)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
