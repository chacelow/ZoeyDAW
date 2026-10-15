import { readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const sections = fileURLToPath(new URL("../../", import.meta.url))
const tests = [
  `${sections}footer/EffectChain/edit-devices.test.tsx`,
  `${sections}transport/metronome.test.ts`,
  `${sections}footer/EffectChain/DeviceDisplay/response.test.ts`,
  `${sections}transport/layout.test.ts`,
  `${sections}transport/index.test.tsx`,
  `${sections}footer/index.test.tsx`,
  `${sections}../../ui/controls/ScrollArea/index.test.tsx`,
]
const testArgs = [
  "test",
  ...tests,
  "--test-name-pattern",
  "property:|BPM (wheel|drag|keyboard)|native Clip host|device chain document edits|opt-in vertical wheel|existing horizontal wheel|ctrl and meta|numeric child consumes",
]
const mutations = [
  {
    name: "reorder-negative-destination",
    file: "footer/EffectChain/edit-devices.ts",
    from: "Math.max(0, Math.min(devices.length - 1, destination))",
    to: "Math.min(devices.length - 1, destination)",
    invariant: "property: reordering conserves",
  },
  {
    name: "metronome-paused-motion",
    file: "transport/metronome.ts",
    from: "if (!playing || !enabled)",
    to: "if (!enabled)",
    invariant: "property: adjacent accepted beats",
  },
  {
    name: "metronome-three-beat-cycle",
    file: "transport/metronome.ts",
    from: "Math.floor(ordinal) % 2",
    to: "Math.floor(ordinal) % 3",
    invariant: "property: adjacent accepted beats",
  },
  {
    name: "device-quadratic-control-sign",
    file: "footer/EffectChain/DeviceDisplay/response.ts",
    from: "control.x - start.x",
    to: "control.x + start.x",
    invariant: "property: quadratic device responses",
  },
  {
    name: "header-left-minimum",
    file: "transport/layout.ts",
    from: "Math.max(measured.left,",
    to: "Math.min(measured.left,",
    invariant: "property: Header columns",
  },
  {
    name: "header-fraction-bias",
    file: "transport/layout.ts",
    from: "remaining / 2",
    to: "remaining / 3",
    invariant: "property: Header columns",
  },
  {
    name: "bpm-fine-keyboard-step",
    file: "transport/index.tsx",
    from: "step={0.01}",
    to: "step={1}",
    invariant: "BPM keyboard fine adjustment",
  },
  {
    name: "bpm-coarse-motion-step",
    file: "transport/index.tsx",
    from: "dragStep={1}",
    to: "dragStep={0.01}",
    invariant: "BPM drag uses",
  },
  {
    name: "clip-host-fixed-height",
    file: "footer/index.tsx",
    from: 'const height = view === "devices" ? theme.project.footerDeviceHeight : "100%"',
    to: "const height = theme.project.footerDeviceHeight",
    invariant: "native Clip host divider drag",
  },
  {
    name: "scroll-wheel-opt-in",
    file: "../../ui/controls/ScrollArea/index.tsx",
    from: "!wheelToHorizontal ||",
    to: "false ||",
    invariant: "opt-in vertical wheel",
  },
  {
    name: "scroll-wheel-orientation",
    file: "../../ui/controls/ScrollArea/index.tsx",
    from: 'orientation !== "horizontal" ||',
    to: "false ||",
    invariant: "opt-in vertical wheel",
  },
  {
    name: "scroll-wheel-double-x",
    file: "../../ui/controls/ScrollArea/index.tsx",
    from: "event.deltaX ||",
    to: "false ||",
    invariant: "existing horizontal wheel",
  },
  {
    name: "scroll-wheel-ctrl",
    file: "../../ui/controls/ScrollArea/index.tsx",
    from: "event.modifiers?.ctrl ||",
    to: "false ||",
    invariant: "ctrl and meta",
  },
  {
    name: "scroll-wheel-meta",
    file: "../../ui/controls/ScrollArea/index.tsx",
    from: "event.modifiers?.cmd",
    to: "false",
    invariant: "ctrl and meta",
  },
  {
    name: "scroll-wheel-child-boundary",
    file: "../../ui/controls/ScrollArea/index.test.tsx",
    from: 'label="Value"',
    to: 'style={{ pointerEvents: "none" }} label="Value"',
    invariant: "numeric child consumes",
  },
]
const baseline = spawnSync(process.execPath, testArgs, { encoding: "utf8" })
if (baseline.status !== 0) throw new Error(`Baseline failed:\n${baseline.stdout}${baseline.stderr}`)
process.stdout.write("| Mutation | Failing tests |\n| --- | ---: |\n")
for (const mutation of mutations) {
  const path = `${sections}${mutation.file}`
  const source = readFileSync(path, "utf8")
  if (source.split(mutation.from).length !== 2)
    throw new Error(`Mutation anchor must be unique: ${mutation.name}`)
  let result
  try {
    writeFileSync(
      path,
      source.replace(mutation.from, () => mutation.to)
    )
    result = spawnSync(process.execPath, testArgs, { encoding: "utf8" })
  } finally {
    writeFileSync(path, source)
  }
  const output = `${result.stdout}${result.stderr}`
  const failures = Number(output.match(/(\d+) fail\b/u)?.[1] ?? 0)
  if (
    result.status === 0 ||
    failures === 0 ||
    /SyntaxError|ParseError/u.test(output) ||
    !output.split("\n").some(line => line.includes("(fail)") && line.includes(mutation.invariant))
  ) {
    throw new Error(`Mutation escaped or did not reach invariant: ${mutation.name}\n${output}`)
  }
  process.stdout.write(`| ${mutation.name} | ${failures} |\n`)
}
