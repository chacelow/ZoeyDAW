import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const input = new URL("../src/controls/metrics/control-metrics.json", import.meta.url)
const output = new URL("../src/controls/metrics/generated.css", import.meta.url)
const { default: defaults, transport, project } = JSON.parse(await readFile(input, "utf8"))
const declarations = profile =>
  Object.entries(profile)
    .map(([key, value]) => `  ${key}: ${value}px;`)
    .join("\n")
const projectVariables = Object.fromEntries(
  Object.entries(project).map(([key, value]) => [
    `--project-${key.replaceAll(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`,
    value,
  ])
)
const css = `/* Generated from control-metrics.json by packages/ui/scripts/control-metrics.mjs. Do not edit. */
@theme inline {
  --spacing-control-h: var(--spacing-control-track);
  --spacing-control-compact: var(--spacing-control-track);
${declarations(defaults)}
  --spacing-control-pad-x: var(--spacing-control-track-pad);
  --spacing-control-icon-compact: var(--spacing-control-icon);
  --spacing-transport-icon: var(--spacing-control-icon);
  --text-control: var(--text-control-track);
  --text-control-compact: var(--text-control-track);
  --text-control-compact--line-height: 1;
  --text-control--line-height: 1;
}

:root {
${declarations(projectVariables)}
}

.project-transport {
${declarations(transport)}
}
`
if (process.argv.includes("--check")) {
  if ((await readFile(output, "utf8").catch(() => "")) !== css) {
    console.error(
      `${fileURLToPath(output)} is stale; run node packages/ui/scripts/control-metrics.mjs`
    )
    process.exitCode = 1
  }
} else {
  await writeFile(output, css)
}
