import { beforeEach, expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { flushSync } from "@gpuix/react"
import { changeLocale, initAppI18n, useAppTranslation } from "@/app/i18n"
import { getPreference } from "@/platform/settings"
import { browserCatalogByLocale } from "@/app/locales/browser-catalog"
import { useBrowser } from "./useBrowser"
import type { BrowserController } from "./useBrowser"
import { englishBrowserLabels, chineseBrowserLabels } from "@/app/locales/sections/browser"

beforeEach(async () => {
  initAppI18n({ initialLanguage: "en-US" })
  await changeLocale("en-US")
})

function mountBrowser() {
  let current: BrowserController | null = null
  function Probe() {
    const { locale } = useAppTranslation()
    current = useBrowser(locale === "zh-CN" ? chineseBrowserLabels : englishBrowserLabels)
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

test("application locale changes display and search without changing selection or favorites", async () => {
  const { root, state, flush } = mountBrowser()
  try {
    expect([...state().favorites]).toEqual(getPreference("browser").favorites)
    flush(() => state().setSelectedId("instruments-wavetable"))
    flush(() => state().navigate("favorites"))
    flush(() => state().setSelectedId("instruments-wavetable"))
    await changeLocale("zh-CN")
    root.renderer.flush()
    expect(state().selected?.entry.id).toBe("instruments-wavetable")
    expect(state().favorites.has("audioEffects-hybrid-reverb")).toBe(true)
    flush(() => state().setQuery("混响"))
    expect(state().rows[0]?.entry).toMatchObject({
      id: "audioEffects-hybrid-reverb",
      name: "混合混响",
    })
    flush(() => state().navigate("instruments"))
    flush(() => state().setQuery("温暖波形"))
    expect(state().rows.map(row => row.entry.id)).toEqual([
      "instruments-wavetable",
      "instruments-wavetable-0",
    ])
    await changeLocale("en-US")
    root.renderer.flush()
    expect(state().rows).toEqual([])
    flush(() => state().setQuery("  ＷＡＲＭ ＷＡＶＥＳ  "))
    expect(state().rows.map(row => row.entry.name)).toEqual(["Wavetable", "Warm Waves"])
  } finally {
    root.unmount()
    await changeLocale("en-US")
  }
})

test("catalog display source changes flow through real browser search while collection metadata remains stable", () => {
  const wavetable = browserCatalogByLocale["en-US"].find(
    entry => entry.id === "instruments-wavetable"
  )
  if (!wavetable) throw new Error("Missing Wavetable catalog entry")
  const originalName = wavetable.name
  const originalTags = wavetable.tags
  const { root, state, flush } = mountBrowser()
  try {
    wavetable.name = "Renamed oscillator"
    wavetable.tags = ["Injectable search tag"]
    flush(() => state().setQuery("injectable search tag"))
    expect(state().rows[0]?.entry).toMatchObject({
      id: "instruments-wavetable",
      name: "Renamed oscillator",
      purple: true,
    })
    expect(state().favorites.has("instruments-wavetable")).toBe(true)
    flush(() => state().navigate("purple"))
    expect(state().rows[0]?.entry.id).toBe("instruments-wavetable")
  } finally {
    wavetable.name = originalName
    wavetable.tags = originalTags
    root.unmount()
  }
})
