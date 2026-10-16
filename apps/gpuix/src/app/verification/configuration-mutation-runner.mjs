import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const app = fileURLToPath(new URL("../../../", import.meta.url))

/** Mutations run in a disposable app copy; concurrent source work remains untouched. */
export function verifyConfigurationMutations({ testFiles, cases }) {
  const isolated = mkdtempSync(path.join(tmpdir(), "gpuix-configuration-mutation-"))
  const home = path.join(isolated, "home")
  const storage = {
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, "config"),
    XDG_DATA_HOME: path.join(home, "data"),
  }
  const run = pattern => {
    const args = ["test", ...testFiles]
    if (pattern) args.push("--test-name-pattern", pattern)
    const result = spawnSync(process.execPath, args, {
      cwd: isolated,
      env: { ...process.env, ...storage },
      encoding: "utf8",
    })
    if (result.error) throw result.error
    return { status: result.status, output: `${result.stdout}${result.stderr}` }
  }
  try {
    mkdirSync(home, { recursive: true })
    cpSync(path.join(app, "src"), path.join(isolated, "src"), { recursive: true })
    for (const name of ["package.json", "tsconfig.json", "bunfig.toml"]) {
      cpSync(path.join(app, name), path.join(isolated, name))
    }
    symlinkSync(path.join(app, "node_modules"), path.join(isolated, "node_modules"), "dir")
    const baseline = run()
    if (baseline.status !== 0) throw new Error(`Configuration baseline failed:\n${baseline.output}`)
    for (const mutation of cases) {
      const file = path.join(isolated, "src", mutation.file)
      const original = readFileSync(file, "utf8")
      if (!original.includes(mutation.from)) throw new Error(`Stale mutation: ${mutation.name}`)
      writeFileSync(
        file,
        original.replaceAll(mutation.from, () => mutation.to)
      )
      const result = run(mutation.pattern)
      writeFileSync(file, original)
      const expected = new RegExp(mutation.pattern, "u")
      if (
        result.status === 0 ||
        !/^\s*[1-9]\d* fail\s*$/mu.test(result.output) ||
        !result.output.split("\n").some(line => line.includes("(fail)") && expected.test(line)) ||
        /SyntaxError|ParseError/u.test(result.output)
      ) {
        throw new Error(
          `Mutation did not reach the consumer regression: ${mutation.name}\n${result.output}`
        )
      }
      console.log(`${mutation.name}: caught by native consumer regression`)
    }
    console.log(`${cases.length} configuration mutations caught; source worktree untouched`)
  } finally {
    rmSync(isolated, { recursive: true, force: true })
  }
}
