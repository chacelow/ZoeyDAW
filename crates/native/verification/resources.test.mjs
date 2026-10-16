import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import { Worker } from "node:worker_threads"

const nativePath = process.env.ZOEYDAW_VERIFICATION_NATIVE
if (!nativePath) throw new Error("Run through crates/native/verification/resources.mjs")
const native = createRequire(import.meta.url)(nativePath)

const request = JSON.stringify({
  protocolVersion: 1,
  sessionId: "native-resources",
  sequence: 0,
  baseRevision: 0,
  revision: 0,
  stage: "open",
  editId: null,
  state: {
    project: {
      bpm: 120,
      numerator: 4,
      denominator: 4,
      loop: { enabled: false, startBar: 1, endBar: 2 },
      sources: [],
      tracks: [],
    },
    control: {
      playing: false,
      recording: false,
      seekBar: 1,
      seekGeneration: 0,
      heldNotes: [],
      midiVelocity: 0.8,
    },
  },
})

async function until(predicate, label) {
  const deadline = performance.now() + 3000
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error(`Timeout: ${label}`)
    await delay(10)
  }
}

function stallJavaScript() {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
}

test("RUST-04 telemetry owns at most one payload under real JS backpressure", async () => {
  const session = native.openSession()
  let callbacks = 0
  try {
    assert.equal(JSON.parse(native.apply(session, request)).kind, "accepted")
    native.subscribeTelemetry(session, json => {
      assert.equal(JSON.parse(json).sessionId, "native-resources")
      callbacks++
      throw new Error("consumer failure is handled by native completion")
    })
    await until(() => callbacks > 0, "first real telemetry")
    for (let round = 0; round < 3; round++) {
      stallJavaScript()
      const resources = native.engineVerificationResources()
      assert.ok(
        resources.telemetryPayloads <= 1,
        `unowned telemetry payloads: ${JSON.stringify(resources)}`
      )
      const before = callbacks
      await until(() => callbacks > before, "telemetry resumes after throwing listener")
    }
  } finally {
    native.dispose(session)
  }
  await until(
    () => native.engineVerificationResources().telemetryPayloads === 0,
    "dispose releases pending telemetry"
  )
  assert.equal(native.engineVerificationResources().sessions, 0)
})

test("RUST-05 repeated session disposal keeps cleanup ownership bounded", async () => {
  const before = native.engineVerificationResources().cleanupOwners
  for (let cycle = 0; cycle < 24; cycle++) {
    const session = native.openSession()
    native.dispose(session)
    native.dispose(session)
    const resources = native.engineVerificationResources()
    assert.equal(resources.sessions, 0)
    assert.ok(
      resources.cleanupOwners <= Math.max(before, 1),
      `retained cleanup owners: ${JSON.stringify(resources)}`
    )
  }
  const baseline = native.engineVerificationResources()
  for (let environment = 0; environment < 3; environment++) {
    const worker = new Worker(
      `
      const { workerData } = require("node:worker_threads")
      const native = require(workerData)
      native.openSession()
    `,
      { eval: true, workerData: nativePath }
    )
    await new Promise((resolve, reject) => {
      worker.once("error", reject)
      worker.once("exit", code =>
        code === 0 ? resolve() : reject(new Error(`Worker exited ${code}`))
      )
    })
    assert.deepEqual(
      native.engineVerificationResources(),
      baseline,
      "Env teardown releases active sessions and its cleanup owner"
    )
  }
})
