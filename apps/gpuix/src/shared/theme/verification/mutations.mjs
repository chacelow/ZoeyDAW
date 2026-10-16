import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const app = fileURLToPath(new URL("../../../../", import.meta.url))
if (!process.versions.bun) throw new Error("Run the source mutation entry with bun")
const sandbox = mkdtempSync(path.join(tmpdir(), "zoeydaw-c1-mutations-"))
const theme = "src/shared/theme/"
const recipesTest = `${theme}color-recipes.test.ts`
const runtimeTest = `${theme}runtime-overrides.test.tsx`
const providerTest = `${theme}ThemeProvider.test.tsx`
const trackTest = "src/project/layout/track.test.ts"
const sceneTest = "src/project/sections/arrangement/core/scene.test.ts"
const mutations = []
for (const [from, to] of [
  ["recipes.editorShell", "30"],
  ["recipes.canvasScrollbar", "10"],
  ["recipes.canvasScrollbarHover", "18"],
  ["recipes.canvasScrollbarActive", "26"],
  ["recipes.scrollbarTrack", "4"],
  ["recipes.arrangementSurfaceSelected", "78"],
  ["recipes.arrangementSurface", "86"],
  ["recipes.arrangementSurfaceAlt", "84"],
  ["recipes.arrangementFadeMask", "50"],
  ["recipes.listRowHover", "90"],
  ["recipes.dialogBackdrop", "10"],
  ["destructive.active[scheme]", '(scheme === "dark" ? 20 : 10)'],
  ["destructive.highlight[scheme]", '(scheme === "dark" ? 30 : 20)'],
  ["destructive.focusBorder", "40"],
  ["destructive.focusOutline[scheme]", '(scheme === "dark" ? 40 : 20)'],
  ["editor.overviewViewport", "12"],
  ["editor.audioLoop", "45"],
  ["editor.markerHover", "30"],
  ["editor.marquee", "20"],
  ["editor.pianoIvoryDark", "75"],
  ["editor.pianoEbony", "80"],
  ["aliases.arrangementLine[scheme]", '(scheme === "light" ? "border" : "muted")'],
  ["aliases.arrangementAutomation", '"destructive"'],
  ["aliases.arrangementVolume", '"chart2"'],
  ["aliases.arrangementMeterGood", '"chart2"'],
  ["aliases.arrangementMeterWarn[scheme]", '(scheme === "light" ? "chart4" : "chart3")'],
  ["aliases.arrangementMeterDanger", '"destructive"'],
  ["aliases.arrangementMeterPeak", '"mutedForeground"'],
  ["aliases.arrangementClipInk[scheme]", '(scheme === "light" ? "foreground" : "card")'],
]) {
  mutations.push({
    name: from,
    file: `${theme}colors.ts`,
    from,
    to,
    test: recipesTest,
    failure: "complete recipe override",
  })
}
for (const [from, to] of [
  ["recipe.velocityNoteBorder", "60"],
  ["recipe.velocitySelected", "{ base: 55, range: 45 }"],
  ["recipe.velocityUnselected", "{ base: 35, range: 65 }"],
  ["scale.base", "(selected ? 55 : 35)"],
  ["scale.range", "(selected ? 45 : 65)"],
]) {
  mutations.push({
    name: from,
    file: `${theme}color-recipes.ts`,
    from,
    to,
    test: recipesTest,
    failure: "complete recipe override",
  })
}
mutations.push(
  ...["control", "transportControl", "project", "design"].map(group => ({
    name: `provider-${group}`,
    file: `${theme}ThemeProvider.tsx`,
    from: `      ${group},`,
    to: `      ${group}: ${group === "control" ? "CONTROL_METRICS.default" : group === "transportControl" ? "CONTROL_METRICS.transport" : group === "project" ? "PROJECT_METRICS" : "DEFAULT_DESIGN_TOKENS"},`,
    test: runtimeTest,
    failure: "runtime group overrides",
  })),
  {
    name: "provider-layout",
    file: `${theme}ThemeProvider.tsx`,
    from: "layout ?? createLayoutTokens(control, project)",
    to: "createLayoutTokens(control, project)",
    test: runtimeTest,
    failure: "runtime group overrides",
  },
  {
    name: "provider-color-recipes",
    file: `${theme}ThemeProvider.tsx`,
    from: "derive(selected.baseColors[scheme], scheme, design.colorRecipes)",
    to: "selected.colors[scheme]",
    test: providerTest,
    failure: "controlled color recipes",
  },
  {
    name: "content-paper-tint",
    file: `${theme}content-color.ts`,
    from: "100 - paperTint",
    to: "100 - 32",
    test: runtimeTest,
    failure: "runtime group overrides",
  },
  {
    name: "track-control-density",
    file: `${theme}layout-tokens.ts`,
    from: 'control["--spacing-control-track"]',
    to: "13",
    test: trackTest,
    failure: "density sources jointly control",
  },
  {
    name: "track-gap-density",
    file: `${theme}layout-tokens.ts`,
    from: 'control["--spacing-control-track-gap"]',
    to: "4",
    test: trackTest,
    failure: "density sources jointly control",
  },
  {
    name: "track-border",
    file: `${theme}layout-tokens.ts`,
    from: "project.trackBorder",
    to: "2",
    test: trackTest,
    failure: "density sources jointly control",
  },
  {
    name: "track-max-height",
    file: `${theme}layout-tokens.ts`,
    from: "project.maxTrackHeight",
    to: "280",
    test: trackTest,
    failure: "density sources jointly control",
  },
  {
    name: "scene-geometry-update",
    file: "src/project/sections/arrangement/core/scene.ts",
    from: "bump({ ...scene, geometry })",
    to: "return",
    test: sceneTest,
    failure: "runtime geometry changes move",
  },
  {
    name: "clip-density-cache-key",
    file: "src/project/sections/arrangement/lane/clip-card-projection.ts",
    from: "previous.rect.trackGeometry === rect.trackGeometry &&",
    to: "",
    test: "src/project/sections/arrangement/lane/LaneRow/LaneRow.test.tsx",
    failure: "refreshes a cached mounted Clip title",
  }
)
try {
  cpSync(path.join(app, "src"), path.join(sandbox, "src"), { recursive: true })
  for (const file of ["tsconfig.json", "bunfig.toml"])
    cpSync(path.join(app, file), path.join(sandbox, file))
  symlinkSync(path.join(app, "node_modules"), path.join(sandbox, "node_modules"), "dir")
  const tests = [...new Set(mutations.map(mutation => mutation.test))]
  const baseline = spawnSync(process.execPath, ["test", ...tests], {
    cwd: sandbox,
    encoding: "utf8",
  })
  if (baseline.status !== 0)
    throw new Error(`Baseline failed:\n${baseline.stdout}${baseline.stderr}`)
  process.stdout.write("| Mutation | Failing regressions |\n| --- | ---: |\n")
  for (const mutation of mutations) {
    const file = path.join(sandbox, mutation.file)
    const source = readFileSync(file, "utf8")
    // Exact member boundaries prevent canvasScrollbar from also mutating its Hover/Active siblings.
    const escaped = mutation.from.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
    const anchor = new RegExp(`${escaped}(?![A-Za-z0-9_])`, "gu")
    if (!anchor.test(source)) throw new Error(`Missing mutation anchor: ${mutation.name}`)
    let result
    try {
      writeFileSync(
        file,
        source.replace(anchor, () => mutation.to)
      )
      result = spawnSync(process.execPath, ["test", mutation.test], {
        cwd: sandbox,
        encoding: "utf8",
      })
    } finally {
      writeFileSync(file, source)
    }
    const output = `${result.stdout}${result.stderr}`
    const failures = Number(output.match(/(\d+) fail\b/u)?.[1] ?? 0)
    if (
      result.status === 0 ||
      failures === 0 ||
      /SyntaxError|ParseError/u.test(output) ||
      !output.split("\n").some(line => line.includes("(fail)") && line.includes(mutation.failure))
    ) {
      throw new Error(`Target regression did not fail: ${mutation.name}\n${output}`)
    }
    process.stdout.write(`| ${mutation.name} | ${failures} |\n`)
  }
  process.stdout.write(`Killed ${mutations.length}/${mutations.length} source-bypass mutations\n`)
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}
