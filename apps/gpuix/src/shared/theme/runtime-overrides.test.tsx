import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { Button } from "@/ui/controls/Button"
import { TrackIdentity } from "@/project/sections/arrangement/tracks/TrackIdentity"
import { TrackLabelsProvider } from "@/project/sections/arrangement/tracks/labels"
import { createTrackLabels } from "@/app/locales/sections/tracks"
import { createMockDocument } from "@/project/adapters/fixtures"
import { CONTROL_METRICS, PROJECT_METRICS } from "./metrics/config"
import { DEFAULT_DESIGN_TOKENS } from "./design-tokens"
import { DEFAULT_LAYOUT_TOKENS, createLayoutTokens } from "./layout-tokens"
import { ThemeProvider } from "./ThemeProvider"
import type { ThemeProviderProps } from "./ThemeProvider"
import type { TestRoot } from "@gpuix/react/testing"
import { colorMix } from "./color-mix"
import { getThemePreset } from "./presets"
import { resolveContentColor } from "./content-color"
import { HomePage } from "@/app/home/HomePage"
import { createRouter, RouterProvider } from "@/app/router/router"
import { ProjectFileProvider } from "@/app/project-file/ProjectFileProvider"
import { createMemoryFileEnvironment } from "@/app/project-file/memory.test-helper"
import { initAppI18n } from "@/app/i18n"

function bounds(root: TestRoot, id: string) {
  const node = root.renderer.findByTestId(id)
  const result = node && root.renderer.getElementBounds(node.id)
  if (!result) throw new Error(`Missing native bounds: ${id}`)
  return result
}

test("runtime group overrides resize real controls and track identity without static geometry", () => {
  const root = createTestRoot({ width: 500, height: 200 })
  const track = createMockDocument().tracks[0]
  if (!track) throw new Error("Missing track fixture")
  const render = (props: Omit<ThemeProviderProps, "children">) =>
    root.render(
      <ThemeProvider {...props}>
        <div style={{ display: "flex", alignItems: "start", height: 150 }}>
          <Button testId="default-control" label="Default" iconOnly />
          <Button testId="transport-control" label="Transport" iconOnly size="transport" />
          <TrackLabelsProvider labels={createTrackLabels("en-US")}>
            <TrackIdentity
              track={track}
              selected={false}
              renaming={false}
              dragging={false}
              onRename={() => {}}
              onRenameEnd={() => {}}
              onChoose={() => {}}
              railCount={0}
            />
          </TrackLabelsProvider>
        </div>
      </ThemeProvider>
    )
  try {
    render({})
    expect(bounds(root, "default-control").height).toBe(13)
    expect(bounds(root, "transport-control").height).toBe(20)
    expect(bounds(root, `track-identity-${track.id}`).width).toBe(100)
    expect(bounds(root, `track-title-${track.id}`).height).toBe(21)

    const control = {
      ...CONTROL_METRICS.default,
      "--spacing-control-track": 29,
      "--spacing-control-track-gap": 5,
    }
    const transportControl = { ...CONTROL_METRICS.transport, "--spacing-control-track": 40 }
    const project = { ...PROJECT_METRICS, identityWidth: 140, trackBorder: 3, maxTrackHeight: 400 }
    const design = {
      ...DEFAULT_DESIGN_TOKENS,
      shape: { ...DEFAULT_DESIGN_TOKENS.shape, controlRadius: 9 },
      colorRecipes: { ...DEFAULT_DESIGN_TOKENS.colorRecipes, contentPaperTint: 61 },
    }
    render({ control, transportControl, project, design })
    expect(bounds(root, "default-control").height).toBe(29)
    expect(bounds(root, "default-control").width).toBe(29)
    expect(bounds(root, "transport-control").height).toBe(40)
    expect(bounds(root, `track-identity-${track.id}`).width).toBe(140)
    expect(bounds(root, `track-title-${track.id}`).height).toBe(39)
    expect(root.renderer.findByTestId("default-control")?.style.borderRadius).toBe(9)

    const colors = getThemePreset("default").colors.dark
    expect(root.renderer.findByTestId(`track-identity-${track.id}`)?.style.backgroundColor).toBe(
      colorMix(resolveContentColor(track.color, colors), 39, colors.arrangementClipPaper)
    )
    const layout = createLayoutTokens(control, project)
    render({
      control,
      transportControl,
      project,
      design,
      layout: { ...layout, track: { ...layout.track, titleHeight: 47 } },
    })
    expect(bounds(root, `track-title-${track.id}`).height).toBe(47)
    render({})
    expect(bounds(root, "default-control").height).toBe(13)
    expect(bounds(root, "transport-control").height).toBe(20)
    expect(bounds(root, `track-title-${track.id}`).height).toBe(21)
  } finally {
    root.unmount()
  }
})

test("Home uses its layout maximum width independently of the track control column", () => {
  initAppI18n()
  const root = createTestRoot({ width: 1200, height: 300 })
  const router = createRouter()
  const show = (maxWidth: number) =>
    root.render(
      <ThemeProvider
        layout={{ ...DEFAULT_LAYOUT_TOKENS, home: { ...DEFAULT_LAYOUT_TOKENS.home, maxWidth } }}
      >
        <RouterProvider value={router}>
          <ProjectFileProvider environment={createMemoryFileEnvironment()} renderer={null}>
            <HomePage />
          </ProjectFileProvider>
        </RouterProvider>
      </ThemeProvider>
    )
  try {
    show(912)
    expect(bounds(root, "home-page").width).toBe(912)
    show(600)
    expect(bounds(root, "home-page").width).toBe(600)
  } finally {
    root.unmount()
  }
})
