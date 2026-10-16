import { minimapMutation } from "./r2-minimap-mutation-preload"

const result = Bun.spawnSync(
  [
    "bun",
    "test",
    "--preload",
    import.meta.dir + "/r2-minimap-mutation-preload.ts",
    minimapMutation.testFile,
    "-t",
    minimapMutation.testName,
  ],
  {
    cwd: new URL("../../../../../..", import.meta.url).pathname,
    env: { ...process.env, R2_MINIMAP_MUTATION: minimapMutation.id },
    stdout: "pipe",
    stderr: "pipe",
  }
)
const output = result.stderr.toString() + result.stdout.toString()
const failures = output.match(/\n\s+(\d+) fail\b/)?.[1]
if (
  !output.includes(`[r2-minimap-mutation] applied ${minimapMutation.id}`) ||
  !output.includes("error: expect(") ||
  !failures ||
  result.exitCode === 0
)
  throw new Error(`Mutation did not produce a test failure: ${minimapMutation.id}\n${output}`)
console.log(`${minimapMutation.id}: ${failures} failed test(s)`)
