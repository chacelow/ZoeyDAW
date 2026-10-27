import { expect, it } from "vitest"
import { accepted, controlled, deferred, harness, state } from "./connection.testing"

it("preserves every launch and both preview sides of its FIFO barrier", async () => {
  const pending = deferred()
  const backend = controlled(request =>
    request.stage === "commit" ? pending.promise : accepted(request)
  )
  const { connection } = harness(backend)
  const initial = state()
  initial.project.launcher = { scenes: [{ id: "a" }, { id: "b" }], quantization: "bar" }
  connection.open("launch-session", initial)
  connection.submit({ stage: "commit", revision: 1, editId: null, state: initial })
  const playing = { ...initial.control, playing: true }
  const performing = { project: initial.project, control: playing }
  connection.submitLaunch({
    command: { kind: "scene", sceneId: "a" },
    control: playing,
    quantize: true,
  })
  connection.submit({ stage: "preview", revision: 1, editId: "gesture", state: performing })
  connection.submitLaunch({
    command: { kind: "scene", sceneId: "b" },
    control: playing,
    quantize: true,
  })
  connection.submit({ stage: "preview", revision: 1, editId: "gesture", state: performing })
  pending.resolve(accepted(backend.requests[1]))
  expect(await connection.whenIdle()).toBe(true)
  expect(
    backend.calls.map(request =>
      "command" in request ? request.command : "stage" in request ? request.stage : "control"
    )
  ).toEqual([
    "open",
    "commit",
    { kind: "scene", sceneId: "a" },
    "preview",
    { kind: "scene", sceneId: "b" },
    "preview",
  ])
  expect(backend.calls.map(request => request.sequence)).toEqual([0, 1, 2, 3, 4, 5])
  connection.dispose()
})

it("Stop removes waiting launches rather than starting them after the document acknowledgement", async () => {
  const pending = deferred()
  const backend = controlled(request =>
    request.stage === "commit" ? pending.promise : accepted(request)
  )
  const { connection } = harness(backend)
  const initial = state()
  initial.project.launcher = { scenes: [{ id: "a" }], quantization: "bar" }
  connection.open("stop-session", initial)
  connection.submit({ stage: "commit", revision: 1, editId: null, state: initial })
  connection.submitLaunch({
    command: { kind: "scene", sceneId: "a" },
    control: { ...initial.control, playing: true },
    quantize: false,
  })
  connection.submitControl(initial.control)
  pending.resolve(accepted(backend.requests[1]))
  expect(await connection.whenIdle()).toBe(true)
  expect(backend.launches).toEqual([])
  expect(backend.controls.map(request => request.control.playing)).toEqual([false])
  connection.dispose()
})
