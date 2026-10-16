import { expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { useState } from "react"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { createRendererState } from "@gpuix/native/host"
import { configurePreferences, createPreferenceOwner } from "@/platform/settings"
import { PREFERENCE_DEFAULTS } from "@/project/defaults/preferences"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { ControlEnvironmentProvider, DragPadNumber } from "@/ui/controls"
import { AppInteractionProvider } from "./interaction"

function mount() {
  const configDir = mkdtempSync(path.join(tmpdir(), "zoeydaw-control-input-"))
  const owner = createPreferenceOwner({ configDir })
  owner.setPreference("numericInput", PREFERENCE_DEFAULTS.numericInput)
  owner.setPreference("pointer", PREFERENCE_DEFAULTS.pointer)
  const release = configurePreferences(owner)
  const root = createTestRoot({ width: 400, height: 200 })
  const gestures: string[] = []
  function Consumer() {
    const [value, setValue] = useState(0)
    return (
      <DragPadNumber
        testId="source-number"
        label="Source number"
        value={value}
        onChange={setValue}
        min={-100}
        max={100}
        step={0.25}
        dragStep={1}
        onGestureStart={() => {
          gestures.push("start")
        }}
        onGestureEnd={() => {
          gestures.push("end")
        }}
      />
    )
  }
  root.render(
    <ThemeProvider>
      <AppInteractionProvider>
        <ControlEnvironmentProvider value={{}}>
          <Consumer />
        </ControlEnvironmentProvider>
      </AppInteractionProvider>
    </ThemeProvider>
  )
  root.renderer.flush()
  const element = root.renderer.findByTestId("source-number")
  if (!element) throw new Error("Missing source control")
  const bounds = root.renderer.getElementBounds(element.id)
  if (!bounds) throw new Error("Missing native control bounds")
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  return {
    ...root,
    owner,
    gestures,
    x,
    y,
    text: () => root.renderer.getAllText(),
    changePreferences() {
      flushSync(() => {
        owner.setPreference("numericInput", {
          dragPixelsPerStep: 8,
          wheelPixelsPerStep: 32,
          wheelLinePixels: 24,
        })
        owner.setPreference("pointer", { ...PREFERENCE_DEFAULTS.pointer, dragThresholdPixels: 7 })
      })
      root.renderer.flush()
    },
    lineWheel(deltaY: number) {
      // The native test helper emits only pixel wheels; dispatch the real host line payload.
      flushSync(() =>
        createRendererState(root.renderer).dispatch({
          elementId: element.id,
          eventType: "scroll",
          deltaY,
          precise: false,
        })
      )
      root.renderer.flush()
    },
    close() {
      root.unmount()
      release()
      rmSync(configDir, { recursive: true, force: true })
    },
  }
}

test("numericInput and pointer sources change actual native DragPad values and gesture activation", () => {
  const a = mount()
  try {
    a.renderer.nativeSimulateMouseDown(a.x, a.y)
    a.renderer.nativeSimulateMouseMove(a.x, a.y - 2, 0)
    expect(a.gestures).toEqual([])
    a.renderer.nativeSimulateMouseMove(a.x, a.y - 3, 0)
    expect(a.gestures).toEqual(["start"])
    expect(a.text()).toContain("1.00")
    a.renderer.nativeSimulateMouseUp(a.x, a.y - 3)
    a.renderer.nativeSimulateScrollWheel(a.x, a.y, 0, 32)
    expect(a.text()).toContain("3.00")
    a.lineWheel(4)
    expect(a.text()).toContain("7.00")

    a.changePreferences()
    const count = a.gestures.length
    a.renderer.nativeSimulateMouseDown(a.x, a.y)
    a.renderer.nativeSimulateMouseMove(a.x, a.y - 6, 0)
    expect(a.gestures).toHaveLength(count)
    expect(a.text()).toContain("7.00")
    a.renderer.nativeSimulateMouseMove(a.x, a.y - 7, 0)
    expect(a.gestures).toHaveLength(count + 1)
    expect(a.text()).toContain("8.00")
    a.renderer.nativeSimulateMouseMove(a.x, a.y - 16, 0)
    expect(a.text()).toContain("9.00")
    a.renderer.nativeSimulateMouseUp(a.x, a.y - 16)
    a.renderer.nativeSimulateScrollWheel(a.x, a.y, 0, 32)
    expect(a.text()).toContain("10.00")
    a.lineWheel(4)
    expect(a.text()).toContain("13.00")
    const pad = a.renderer.findByTestId("source-number")
    if (!pad) throw new Error("Missing source control after updates")
    a.renderer.nativeSimulateKeystrokes(pad.id, "up")
    expect(a.text()).toContain("13.25")
  } finally {
    a.close()
  }
})

test("preference updates do not rescale a pressed DragPad gesture", () => {
  const a = mount()
  try {
    a.renderer.nativeSimulateMouseDown(a.x, a.y)
    a.changePreferences()
    a.renderer.nativeSimulateMouseMove(a.x, a.y - 4, 0)
    expect(a.gestures).toEqual(["start"])
    expect(a.text()).toContain("1.00")
    a.renderer.nativeSimulateMouseMove(a.x, a.y - 8, 0)
    expect(a.text()).toContain("2.00")
    a.renderer.nativeSimulateMouseUp(a.x, a.y - 8)
    a.renderer.nativeSimulateMouseDown(a.x, a.y)
    a.renderer.nativeSimulateMouseMove(a.x, a.y - 6, 0)
    expect(a.gestures).toEqual(["start", "end"])
    a.renderer.nativeSimulateMouseMove(a.x, a.y - 8, 0)
    expect(a.text()).toContain("3.00")
    a.renderer.nativeSimulateMouseUp(a.x, a.y - 8)
  } finally {
    a.close()
  }
})
