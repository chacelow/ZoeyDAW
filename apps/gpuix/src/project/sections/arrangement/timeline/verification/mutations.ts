import { mutationCases } from "./mutation-preload"

for (const [id, selected] of Object.entries(mutationCases)) {
  const result = Bun.spawnSync(
    [
      "bun",
      "test",
      "--preload",
      import.meta.dir + "/mutation-preload.ts",
      selected.testFile,
      "-t",
      selected.testName,
    ],
    {
      cwd: new URL("../../../../../..", import.meta.url).pathname,
      env: { ...process.env, TIMELINE_MUTATION: id },
      stdout: "pipe",
      stderr: "pipe",
    }
  )
  const output = result.stderr.toString() + result.stdout.toString()
  const failures = output.match(/\n\s+(\d+) fail\b/)?.[1]
  if (
    !output.includes(`[timeline-mutation] applied ${id}`) ||
    !output.includes("error: expect(") ||
    !failures ||
    result.exitCode === 0
  )
    throw new Error(`Mutation did not produce a test failure: ${id}\n${output}`)
  console.log(`${id}: ${failures} failed test(s)`)
}
