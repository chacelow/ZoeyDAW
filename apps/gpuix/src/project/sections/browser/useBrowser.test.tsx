import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { useBrowser } from "./useBrowser"
import type { BrowserController } from "./useBrowser"

function mountBrowser() {
  let current: BrowserController | null = null
  function Probe() {
    current = useBrowser()
    return <div />
  }
  const root = createTestRoot({ width: 300, height: 200 })
  root.render(<Probe />)
  root.renderer.flush()
  return {
    root,
    state: () => {
      if (!current) throw new Error("Browser not mounted")
      return current
    },
    flush: (action: () => void) => {
      flushSync(action)
      root.renderer.flush()
    },
  }
}

test("resource selection is optional and restored independently for each navigation source", () => {
  const { root, state, flush } = mountBrowser()
  try {
    expect(state().selected).toBeUndefined()
    flush(() => state().setSelectedId("instruments-wavetable"))
    flush(() => state().navigate("samples"))
    expect(state().selected).toBeUndefined()
    flush(() => state().setSelectedId("samples-Piano C3.wav"))
    expect(state().selected?.entry.name).toBe("Piano C3.wav")
    flush(() => state().travel("back"))
    expect(state().selected?.entry.name).toBe("Wavetable")
    flush(() => state().travel("forward"))
    expect(state().selected?.entry.name).toBe("Piano C3.wav")
  } finally {
    root.unmount()
  }
})

test("search retains parents and matching descendants, restores filtered selection and separates expansion contexts", () => {
  const { root, state, flush } = mountBrowser()
  try {
    flush(() => state().navigate("instruments"))
    flush(() => state().setSelectedId("instruments-wavetable"))
    flush(() => state().setQuery("Warm Waves"))
    expect(state().rows.map(row => row.entry.name)).toEqual(["Wavetable", "Warm Waves"])
    expect(state().rows[1]?.parentId).toBe("instruments-wavetable")
    flush(() => state().toggleExpanded("instruments-wavetable"))
    expect(state().rows.map(row => row.entry.name)).toEqual(["Wavetable"])
    flush(() => state().setQuery("not-a-resource"))
    expect(state().selected).toBeUndefined()
    expect(state().rows).toEqual([])
    flush(() => state().setQuery(""))
    expect(state().selected?.entry.name).toBe("Wavetable")
    expect(state().rows.find(row => row.entry.id === "instruments-wavetable")?.expanded).toBe(false)
  } finally {
    root.unmount()
  }
})

test("favorites include selected child resources without retaining unrelated siblings", () => {
  const { root, state, flush } = mountBrowser()
  try {
    flush(() => state().toggleFavorite("instruments-analog-0"))
    flush(() => state().navigate("favorites"))
    flush(() => state().setQuery("Analog"))
    expect(state().rows.map(row => row.entry.name)).toEqual(["Analog", "Warm Pad"])
    flush(() => state().toggleFavorite("instruments-analog-0"))
    expect(state().rows).toEqual([])
  } finally {
    root.unmount()
  }
})

test("source history clears forward navigation after branching and resets kind but retains search", () => {
  const { root, state, flush } = mountBrowser()
  try {
    flush(() => state().navigate("instruments"))
    flush(() => state().navigate("samples"))
    flush(() => state().travel("back"))
    flush(() => {
      state().setQuery("Warm")
      state().setKind("preset")
    })
    flush(() => state().navigate("audioEffects"))
    expect(state().canGoForward).toBe(false)
    expect(state().kind).toBe("all")
    expect(state().query).toBe("Warm")
    flush(() => state().setDescending(true))
    const names = state()
      .rows.filter(row => row.depth === 0)
      .map(row => row.entry.name)
    expect(names).toEqual([...names].sort((a, b) => -a.localeCompare(b)))
  } finally {
    root.unmount()
  }
})
