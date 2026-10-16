import { ARRANGEMENT_DEFAULTS } from "@/project/defaults/arrangement"
import { describe, expect, test } from "bun:test"
import { createMinimapGesture } from "./gesture"
import type { MinimapGeometry } from "../../core/viewport/minimap"

function mount() {
  let geometry: MinimapGeometry = {
    policy: ARRANGEMENT_DEFAULTS,
    bars: 128,
    viewportWidth: 800,
    pxPerBar: 100,
    scrollX: 4000,
    minPxPerBar: 6.25,
    maxPxPerBar: 131072,
  }
  let epoch = "project:0"
  let hidden = false
  let restored: { x: number; y: number } | null = null
  const gesture = createMinimapGesture({
    read: () => ({ geometry, width: 1280, left: 0, epoch }),
    publish: next => {
      geometry = { ...geometry, ...next }
    },
    navigate: () => {},
    cursor: {
      capture: point => ({ x: 1000 + point.x, y: 500 + point.y }),
      hide: () => {
        hidden = true
        return true
      },
      restore: point => {
        hidden = false
        restored = point
        return true
      },
    },
  })
  return {
    gesture,
    state: () => geometry,
    hidden: () => hidden,
    restored: () => restored,
    replaceProject() {
      epoch += ":next"
      geometry = { ...geometry, pxPerBar: 200, scrollX: 1000 }
    },
  }
}

describe("Minimap navigation ownership", () => {
  test("an old minimap gesture restores only its cursor after the project owner changes", () => {
    const a = mount()
    a.gesture.down({ x: 440, y: 21 })
    a.gesture.move({ x: 440, y: 60 })
    expect(a.hidden()).toBe(true)
    a.replaceProject()
    a.gesture.cancel()
    expect(a.state().pxPerBar).toBe(200)
    expect(a.state().scrollX).toBe(1000)
    expect(a.hidden()).toBe(false)
  })

  test("jitter remains pressed and subsequent downward travel zooms out without dismissing", () => {
    const a = mount()
    a.gesture.down({ x: 452, y: 21 })
    a.gesture.move({ x: 453, y: 22 })
    expect(a.gesture.phase).toBe("pressed")
    expect(a.hidden()).toBe(false)
    expect(a.state().pxPerBar).toBe(100)
    a.gesture.move({ x: 452, y: 121 })
    expect(a.gesture.phase).toBe("dragging")
    expect(a.hidden()).toBe(true)
    expect(a.state().pxPerBar).toBeLessThan(100)
    a.gesture.up()
    expect(a.gesture.phase).toBe("idle")
    expect(a.hidden()).toBe(false)
    expect(a.restored()).toEqual({ x: 1452, y: 521 })
  })

  test("horizontal panning has fixed gain and no event-count or velocity dependency", () => {
    const a = mount()
    const b = mount()
    a.gesture.down({ x: 440, y: 21 })
    b.gesture.down({ x: 440, y: 21 })
    a.gesture.move({ x: 540, y: 21 })
    for (let x = 444; x <= 540; x += 4) b.gesture.move({ x, y: 21 })
    expect(a.state().scrollX).toBe(4250)
    expect(b.state()).toEqual(a.state())
    a.gesture.up()
    b.gesture.up()
  })

  test("each edge pins the opposite musical boundary", () => {
    for (const side of ["left", "right"]) {
      const a = mount()
      const x = side === "left" ? 400 : 480
      a.gesture.down({ x, y: 21 })
      a.gesture.move({ x: x + 20, y: 21 })
      const state = a.state()
      const pinned =
        side === "left" ? (state.scrollX + 800) / state.pxPerBar : state.scrollX / state.pxPerBar
      expect(pinned).toBeCloseTo(side === "left" ? 48 : 40)
      a.gesture.up()
    }
  })

  test("outside click navigates and cancellation restores the press baseline", () => {
    const a = mount()
    a.gesture.down({ x: 1000, y: 21 })
    expect(a.state().scrollX).toBe(9600)
    a.gesture.cancel()
    expect(a.state().scrollX).toBe(4000)
    a.gesture.down({ x: 440, y: 21 })
    a.gesture.move({ x: 600, y: -40 })
    a.gesture.dispose()
    expect(a.state().scrollX).toBe(4000)
    expect(a.state().pxPerBar).toBe(100)
    expect(a.hidden()).toBe(false)
  })

  test("zoom preserves the pointer ratio across randomized interior anchors", () => {
    let seed = 25019
    for (let i = 0; i < 300; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const ratio = 0.1 + (seed / 2 ** 32) * 0.8
      const a = mount()
      const x = 400 + 80 * ratio
      a.gesture.down({ x, y: 21 })
      a.gesture.move({ x, y: -29 })
      const state = a.state()
      expect((state.scrollX + 800 * ratio) / state.pxPerBar).toBeCloseTo(40 + 8 * ratio)
      a.gesture.up()
    }
  })
})
