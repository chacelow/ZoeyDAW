import { readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const app = fileURLToPath(new URL("../../../../", import.meta.url))
const adapters = fileURLToPath(new URL("../", import.meta.url))
const mutations = [
  {
    name: "serialize-uncommitted-workspace",
    file: "snapshots.ts",
    from: "stringifyProject(getCommittedDocument(), getCommittedWorkspace())",
    to: "stringifyProject(getCommittedDocument(), get().workspace)",
    test: "snapshots.test.ts",
    failure: "serializes and saves committed workspace",
  },
  {
    name: "save-uncommitted-workspace",
    file: "snapshots.ts",
    from: "const workspace = getCommittedWorkspace()",
    to: "const workspace = get().workspace",
    test: "snapshots.test.ts",
    failure: "serializes and saves committed workspace",
  },
  {
    name: "queued-control-fence-regression",
    file: "backend/connection/connection.ts",
    from: "controlSequence = Math.max(controlSequence, request.sequence)",
    to: "controlSequence = request.sequence",
    test: "backend/connection.test.ts",
    failure: "keeps the latest requested seek fence",
  },
  {
    name: "drop-recording-before-teardown",
    file: "runtime/runtime-backend.ts",
    from: "    editing.flushRecording()\n    owner.sessionCounter++",
    to: "    owner.sessionCounter++",
    occurrences: 2,
    test: "runtime/project-runtime.test.ts",
    failure: "retains recording across failed",
  },
  {
    name: "replay-recording-journal",
    file: "runtime/runtime-editing.ts",
    from: "const journal = runtime.recordingJournal\n    runtime.recordingJournal = []",
    to: "const journal = runtime.recordingJournal",
    test: "runtime/project-runtime.test.ts",
    failure: "retains recording across failed",
  },
  {
    name: "release-before-quiescing",
    file: "runtime/runtime-backend.ts",
    from: "function closeBackend(): void {\n    owner.isRuntimeDisposed = true",
    to: "function closeBackend(): void {",
    test: "runtime/recording-lifecycle.test.ts",
    failure: "retains recording during",
  },
  {
    name: "registration-before-quiescing",
    file: "runtime/runtime-backend.ts",
    from: "): () => void {\n    owner.isRuntimeDisposed = true",
    to: "): () => void {",
    test: "runtime/recording-lifecycle.test.ts",
    failure: "retains recording during",
  },
  {
    name: "unregister-before-quiescing",
    file: "runtime/runtime-backend.ts",
    from: "      owner.isRuntimeDisposed = true\n      if (owner.activeEdit)",
    to: "      if (owner.activeEdit)",
    test: "runtime/recording-lifecycle.test.ts",
    failure: "retains recording during",
  },
  {
    name: "drop-submitted-recording-on-rejection",
    file: "runtime/runtime-backend.ts",
    from: "const unreconciledRecording = owner.recordingPending",
    to: "const unreconciledRecording = owner.recordingPending\n    owner.recordingPending = []",
    test: "runtime/recording-lifecycle.test.ts",
    failure: "retains submitted recording",
  },
  {
    name: "accept-before-bar-one",
    file: "../model/persistence.ts",
    from: "const barPosition = (v: unknown): v is number => number(v) && v >= 1",
    to: "const barPosition = (v: unknown): v is number => number(v) && v > 0",
    test: "snapshots.test.ts",
    failure: "before bar one",
  },
  {
    name: "interleave-group-copies",
    file: "tracks.ts",
    from: "return [updated, ...(branchesAfter.get(track.id) ?? [])]",
    to: "return [updated, ...remappedCopies.filter(item => item.sourceId === track.id).map(item => item.copy)]",
    test: "../model/project.test.ts",
    failure: "duplicates a complete group subtree",
  },
  {
    name: "leak-failed-native-construction",
    file: "backend/native.ts",
    from: "      engine.dispose(handle)\n    } catch {\n      throw error",
    to: "      void handle\n    } catch {\n      throw error",
    test: "backend/native.test.ts",
    failure: "releases the opened native session",
  },
  {
    name: "mask-original-native-construction-error",
    file: "backend/native.ts",
    from: "engine.dispose(handle)\n    } catch {\n      throw error",
    to: "engine.dispose(handle)\n    } catch (cleanupError) {\n      throw cleanupError",
    test: "backend/native.test.ts",
    failure: "releases the opened native session",
  },
  {
    name: "leave-legacy-midi-notes-without-ids",
    file: "../model/persistence.ts",
    from: "note.id = id",
    to: "void id",
    test: "../model/persistence-midi-identity.test.ts",
    failure: "normalizes missing MIDI note IDs",
  },
]
const tests = [...new Set(mutations.map(mutation => `${adapters}${mutation.test}`))]
const baseline = spawnSync(process.execPath, ["test", ...tests], { cwd: app, encoding: "utf8" })
if (baseline.status !== 0) throw new Error(`Baseline failed:\n${baseline.stdout}${baseline.stderr}`)
process.stdout.write("| Mutation | Failing tests |\n| --- | ---: |\n")
for (const mutation of mutations) {
  const path = `${adapters}${mutation.file}`
  const source = readFileSync(path, "utf8")
  if (source.split(mutation.from).length - 1 !== (mutation.occurrences ?? 1)) {
    throw new Error(`Mutation anchor count changed: ${mutation.name}`)
  }
  let result
  try {
    writeFileSync(
      path,
      source.replaceAll(mutation.from, () => mutation.to)
    )
    result = spawnSync(process.execPath, ["test", `${adapters}${mutation.test}`], {
      cwd: app,
      encoding: "utf8",
    })
  } finally {
    writeFileSync(path, source)
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
