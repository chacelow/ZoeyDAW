import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const mutations = [
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
    name: "Space in settings leaks into transport",
    file: "AppShell.tsx",
    from: "playbackKeysEnabled={!settingsOpen && !close.asking}",
    to: "playbackKeysEnabled={!close.asking}",
    tests: "src/app/AppShell.test.tsx",
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
]

function run(tests) {
  const result = spawnSync(process.execPath, ["test", tests], { cwd: app, encoding: "utf8" })
  if (result.error) throw result.error
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

const baseline = run("src/app")
if (baseline.status !== 0) throw new Error(`Baseline failed:\n${baseline.output}`)
for (const mutation of mutations) {
  const file = path.join(app, "src/app", mutation.file)
  const original = readFileSync(file, "utf8")
  if (!original.includes(mutation.from)) throw new Error(`Stale mutation: ${mutation.name}`)
  let result
  try {
    writeFileSync(
      file,
      original.replace(mutation.from, () => mutation.to)
    )
    result = run(mutation.tests)
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
console.log(`${mutations.length} mutations caught; originals restored`)
