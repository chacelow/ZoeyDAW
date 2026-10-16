import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const mutations = [
  {
    name: "R1c splitter restores hardcoded English units",
    file: "../ui/panels/Separator/index.tsx",
    from: "String(Math.round(group.sizes[index] ?? 0))",
    to: `\`\${Math.round(group.sizes[index] ?? 0)} pixels\``,
    tests: "src/ui/panels/Separator/accessibility.test.tsx",
  },
  ...["controls/RadioGroup/keyboard.ts", "panels/Separator/index.tsx"].map(file => ({
    name: `R1c consumed arrows bubble from ${file}`,
    file: `../ui/${file}`,
    from: `event.preventDefault()\n${file.startsWith("panels") ? "    " : "  "}event.stopPropagation()`,
    to: "void event",
    tests: "src/app/project/composition.test.tsx",
    pattern: "tab navigation",
  })),
  {
    name: "dirty close bypasses confirmation",
    file: "window/unsaved-close.ts",
    from: 'state.phase === "armed" || !dirty',
    to: 'state.phase === "armed" || dirty',
    tests: "src/app/window/unsaved-close.test.ts",
  },
  {
    name: "failed save arms closing",
    file: "window/unsaved-close.ts",
    from: '(choice === "save" && !saved)',
    to: "false",
    tests: "src/app/window/unsaved-close.test.ts",
  },
  {
    name: "project id path loses encoding",
    file: "router/route.ts",
    from: "encodeURIComponent(route.projectId)",
    to: "route.projectId",
    tests: "src/app/router/router.test.ts",
  },
  {
    name: "view unmount loses its lease cleanup",
    file: "project/ProjectPage.tsx",
    from: "return startProjectRuntime()",
    to: "startProjectRuntime()",
    tests: "src/app/AppShell.test.tsx",
  },
  {
    name: "language selection is no longer persisted",
    file: "i18n/index.ts",
    from: "persistLocale(locale)",
    to: "void locale",
    tests: "src/app/AppShell.test.tsx",
  },
  {
    name: "old Clip View request is treated as a new request",
    file: "project/useProjectShell.ts",
    from: "editorRequest === handledRequest.current",
    to: "editorRequest === -1",
    tests: "src/app/AppShell.test.tsx",
  },
  {
    name: "retired native close predicate still vetoes",
    file: "window/useUnsavedCloseGuard.ts",
    from: "if (isRetired) return true",
    to: "void isRetired",
    tests: "src/app/AppShell.test.tsx",
  },
  {
    name: "preset click stops selecting",
    file: "settings/ThemePresetGrid.tsx",
    from: "if (isThemePresetId(next)) onValueChange(next)",
    to: "void next",
    tests: "src/app/AppShell.test.tsx",
  },
  {
    name: "modal stops guarding global Browser search",
    file: "project/composition.ts",
    from: "deps.interaction.isModalOpen()",
    to: "false",
    tests: "src/app/AppShell.test.tsx",
    pattern: "global Cmd",
  },
  {
    name: "preset repair escapes the startup failure boundary",
    file: "settings/preference-store.ts",
    from: "try {\n    setting.repair?.()",
    to: "setting.repair?.()\n  try {",
    tests: "src/app/settings/preference-store.test.ts",
  },
  {
    name: "arrow focus stops revealing the preset",
    file: "settings/ThemePresetGrid.tsx",
    from: "renderer?.scrollIntoView?.(focused)",
    to: "void focused",
    tests: "src/app/settings/ThemePresetGrid.test.tsx",
  },
  {
    name: "Tab focus stops revealing the preset",
    file: "dialog/ModalDialog.tsx",
    from: "renderer?.scrollIntoView?.(focused)",
    to: "void focused",
    tests: "src/app/settings/ThemePresetGrid.test.tsx",
  },
  {
    name: "native dispose becomes a no-op behind the JS facade",
    file: "AppShell.test.tsx",
    from: "const originalDispose = engine.dispose",
    to: "const originalDispose = engine.dispose\n    const skippedDispose = spyOn(engine, 'dispose').mockImplementation(() => {})\n    cleanups.push(() => skippedDispose.mockRestore())",
    tests: "src/app/AppShell.test.tsx",
  },
  {
    name: "lane draw gesture stops marking held B",
    file: "project/composition.ts",
    from: "markDrawModeGesture: timeline.keyboard.markDrawGesture",
    to: "markDrawModeGesture: () => {}",
    tests: "src/app/project/composition.test.tsx",
    pattern: "held B",
  },
  {
    name: "native text focus is misclassified as timeline",
    file: "project/composition.ts",
    from: 'if (deps.interaction.isTextFocused()) return "text"',
    to: 'if (false) return "text"',
    tests: "src/app/project/composition.test.tsx",
    pattern: "native text focus",
  },
  {
    name: "editors stop reporting text focus leases",
    file: "../ui/controls/ControlEnvironment/index.tsx",
    from: "if (active && !release.current)",
    to: "if (false)",
    tests: "src/app/project/composition.test.tsx",
    pattern: "native text focus",
  },
  {
    name: "a second window owner processes timeline keys",
    file: "project/composition.ts",
    from: "windowKey = event.keystrokeId",
    to: "windowKey = event.keystrokeId; timeline.keyboard.down(event)",
    tests: "src/app/project/composition.test.tsx",
    pattern: "one native key sequence",
  },
  {
    name: "collapsed Browser search guard is removed",
    file: "project/composition.ts",
    from: "deps.browserCollapsed()",
    to: "false",
    tests: "src/app/AppShell.test.tsx",
    pattern: "global Cmd",
  },
  {
    name: "track rails deduct controls from time width again",
    file: "../project/sections/arrangement/tracks/TrackRows/index.tsx",
    from: "const laneWidth = viewport.width",
    to: "const laneWidth = Math.max(0, viewport.width - scene.geometry.track.controlsWidth)",
    tests: "src/app/project/composition.test.tsx",
    pattern: "real TrackRows",
  },
  {
    name: "timeline loses automation parameter projection",
    file: "../project/sections/arrangement/timeline/controller.ts",
    from: "sceneStore.setAutomationParameters(current.session.automationParameters)",
    to: "void current.session.automationParameters",
    tests: "src/app/project/composition.test.tsx",
    pattern: "timeline projection",
  },
  {
    name: "stopped composition keeps native frame demand active",
    file: "project/composition.ts",
    from: "!disposed &&",
    to: "true ||",
    tests: "src/app/project/frame-demand.test.tsx",
    pattern: "stopped idle",
  },
  {
    name: "playback demand changes stop notifying the root",
    file: "project/composition.ts",
    from: "if (next.session.playing !== previous.session.playing) listener()",
    to: "void previous",
    tests: "src/app/project/frame-demand.test.tsx",
    pattern: "stopped idle",
  },
  {
    name: "ruler start no longer notifies native frame demand",
    file: "../project/sections/arrangement/timeline/viewport/auto-scroll.ts",
    from: "if (!wasActive) notifyDemand()",
    to: "void wasActive",
    tests: "src/app/project/frame-demand.test.tsx",
    pattern: "ruler autoscroll",
  },
  {
    name: "readOnly Input loses its text focus lease",
    file: "../ui/controls/Input/index.tsx",
    from: "useTextFocusBinding(!disabled)",
    to: "useTextFocusBinding(!disabled && !readOnly)",
    tests: "src/app/project/composition.test.tsx",
    pattern: "focused readOnly Input",
  },
  {
    name: "resume first present loses synchronous React commit",
    file: "project/useProjectComposition.ts",
    from: "flushSync(() => composition?.tick(timestamp))",
    to: "composition?.tick(timestamp)",
    tests: "src/app/project/frame-demand.test.tsx",
    pattern: "resume commits",
  },
  {
    name: "resume subscribes while composition is idle",
    file: "project/useProjectComposition.ts",
    from: "useResumeFrame(timestamp => {\n    flushSync(() => composition?.tick(timestamp))\n  }, frameDemand)",
    to: "useResumeFrame(timestamp => {\n    flushSync(() => composition?.tick(timestamp))\n  }, true)",
    tests: "src/app/project/frame-demand.test.tsx",
    pattern: "stopped idle",
  },
  {
    name: "resume tick is disconnected from the root",
    file: "project/useProjectComposition.ts",
    from: "useResumeFrame(timestamp => {\n    flushSync(() => composition?.tick(timestamp))\n  }, frameDemand)",
    to: "void frameDemand",
    tests: "src/app/project/frame-demand.test.tsx",
    pattern: "resume commits",
  },
]

function run(tests, pattern) {
  const args = ["test", tests, "--timeout", "30000"]
  if (pattern) args.push("--test-name-pattern", pattern)
  const result = spawnSync(process.execPath, args, { cwd: app, encoding: "utf8" })
  if (result.error) throw result.error
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

const filter = process.argv[2]
const selected = filter ? mutations.filter(mutation => mutation.name.includes(filter)) : mutations
if (selected.length === 0) throw new Error(`No mutation matches ${filter}`)
if (!filter) {
  const baseline = run("src/app")
  if (baseline.status !== 0) throw new Error(`Baseline failed:\n${baseline.output}`)
}
for (const mutation of selected) {
  if (filter) {
    const baseline = run(mutation.tests, mutation.pattern)
    if (baseline.status !== 0) throw new Error(`Baseline failed:\n${baseline.output}`)
  }
  const file = path.join(app, "src/app", mutation.file)
  const original = readFileSync(file, "utf8")
  if (!original.includes(mutation.from)) throw new Error(`Stale mutation: ${mutation.name}`)
  let result
  try {
    writeFileSync(
      file,
      original.replace(mutation.from, () => mutation.to)
    )
    result = run(mutation.tests, mutation.pattern)
  } finally {
    writeFileSync(file, original)
  }
  const failed = result.output.match(/^\s*(\d+) fail\s*$/mu)?.[1]
  if (result.status === 0 || !failed || !result.output.includes("(fail)")) {
    throw new Error(
      `Mutation was not caught by a behavior assertion: ${mutation.name}\n${result.output}`
    )
  }
  console.log(`${mutation.name}: ${failed} failing test(s)`)
}
console.log(`${selected.length} mutations caught; originals restored`)
