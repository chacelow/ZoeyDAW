import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { compileApplication } from "./bundle.mjs"
import { repository } from "./metadata.mjs"

const evidence = process.argv[2]
if (!evidence) throw new Error("Usage: bun scripts/release/smoke.mjs <evidence-directory>")
const output = path.resolve(evidence)
mkdirSync(output, { recursive: true })
const isolated = mkdtempSync(path.join(tmpdir(), "zoeydaw-release-smoke-"))
try {
  const executable = path.join(isolated, "native-smoke")
  await compileApplication({
    entrypoint: path.join(repository, "scripts/release/smoke.tsx"),
    tsconfig: path.join(repository, "scripts/release/tsconfig.json"),
    outfile: executable,
  })
  execFileSync(executable, [output], {
    cwd: isolated,
    env: { ...process.env, GPUIX_BACKGROUND: "1" },
    stdio: "inherit",
    timeout: 30_000,
  })
} finally {
  rmSync(isolated, { recursive: true, force: true })
}
