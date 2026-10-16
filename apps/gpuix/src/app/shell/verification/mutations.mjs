import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const directory = path.dirname(fileURLToPath(import.meta.url))
const app = path.resolve(directory, "../../../..")
const test = path.join(app, "src/app/shell/TitleBar.test.tsx")
function run(mutation) {
  const preload = mutation ? ["--preload", path.join(directory, "mutation-preload.ts")] : []
  const result = spawnSync(process.execPath, ["test", ...preload, test], {
    cwd: app,
    env: { ...process.env, T2_MUTATION: mutation ?? "" },
    encoding: "utf8",
    timeout: 30_000,
  })
  if (result.error) throw result.error
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}
const baseline = run()
if (baseline.status !== 0) throw new Error(`Titlebar baseline failed:\n${baseline.output}`)
for (const name of ["double-click-count", "primary-button", "settings-hitbox", "title-hitbox"]) {
  const result = run(name)
  if (
    result.status === 0 ||
    !result.output.includes("(fail)") ||
    !result.output.includes("expect(received)")
  ) {
    throw new Error(`Mutation ${name} did not fail a behavioral assertion:\n${result.output}`)
  }
  console.log(`caught ${name}`)
}
console.log("4 titlebar mutations caught; source files were not modified")
