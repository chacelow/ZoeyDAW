import { expect, it, vi } from "vitest"
import { createApplicationCloseController } from "./application-close"
import type { CloseChoice } from "./application-close"
import type { CloseBehavior } from "@/shared/native/close-behavior"
import type {
  ApplicationCloseRequest,
  ApplicationCloseResolution,
} from "@/shared/native/application-lifecycle"

function setup() {
  const dependencies = {
    native: {
      resolve: vi.fn(async (_id: string, _action: ApplicationCloseResolution) => true),
      pending: vi.fn(async (): Promise<ApplicationCloseRequest | null> => null),
    },
    behavior: vi.fn((): CloseBehavior => "ask"),
    isBusy: vi.fn(() => false),
    confirmDiscard: vi.fn(async () => true),
    cancelDiscard: vi.fn(),
    chooseClose: vi.fn(async (): Promise<CloseChoice> => "quit"),
    resolveChoice: vi.fn((_choice: CloseChoice) => {}),
    onError: vi.fn((_error: unknown) => {}),
  }
  return { dependencies, controller: createApplicationCloseController(dependencies) }
}

it("hides to tray without discarding the live document or consulting its dirty guard", async () => {
  const { dependencies, controller } = setup()
  dependencies.behavior.mockReturnValue("tray")
  await controller.receive({ requestId: "close", intent: "close-button" })
  expect(dependencies.native.resolve).toHaveBeenCalledWith("close", "hide")
  expect(dependencies.confirmDiscard).not.toHaveBeenCalled()
  expect(dependencies.chooseClose).not.toHaveBeenCalled()
})

it("uses ask/remember policy for the close button but explicit Quit always passes the save guard", async () => {
  const { dependencies, controller } = setup()
  dependencies.chooseClose.mockResolvedValue("hide")
  await controller.receive({ requestId: "close", intent: "close-button" })
  expect(dependencies.native.resolve).toHaveBeenLastCalledWith("close", "hide")
  dependencies.behavior.mockReturnValue("tray")
  dependencies.confirmDiscard.mockResolvedValue(false)
  await controller.receive({ requestId: "quit", intent: "explicit-exit" })
  expect(dependencies.confirmDiscard).toHaveBeenCalledOnce()
  expect(dependencies.native.resolve).toHaveBeenLastCalledWith("quit", "cancel")
})

it("waits for Save/Discard approval before issuing the one-shot native exit", async () => {
  const { dependencies, controller } = setup()
  let approve!: (discard: boolean) => void
  dependencies.confirmDiscard.mockImplementation(
    () =>
      new Promise(resolve => {
        approve = resolve
      })
  )
  const quitting = controller.receive({ requestId: "quit", intent: "explicit-exit" })
  expect(dependencies.native.resolve).not.toHaveBeenCalled()
  approve(true)
  await quitting
  expect(dependencies.native.resolve).toHaveBeenCalledWith("quit", "exit")
})

it("does not ask to discard or quit during a file operation", async () => {
  const { dependencies, controller } = setup()
  dependencies.isBusy.mockReturnValue(true)
  await controller.receive({ requestId: "quit", intent: "explicit-exit" })
  expect(dependencies.confirmDiscard).not.toHaveBeenCalled()
  expect(dependencies.onError).toHaveBeenLastCalledWith("fileOperationBusy")
  expect(dependencies.native.resolve).toHaveBeenCalledWith("quit", "cancel")
})

it("rechecks busy state after the save dialog and keeps a newly started operation alive", async () => {
  const { dependencies, controller } = setup()
  dependencies.confirmDiscard.mockImplementation(async () => {
    dependencies.isBusy.mockReturnValue(true)
    return true
  })
  await controller.receive({ requestId: "quit", intent: "explicit-exit" })
  expect(dependencies.native.resolve).toHaveBeenCalledWith("quit", "cancel")
  expect(dependencies.onError).toHaveBeenLastCalledWith("fileOperationBusy")
})

it("upgrades an outstanding close-choice dialog to explicit Quit without choosing tray", async () => {
  const { dependencies, controller } = setup()
  let choose!: (choice: CloseChoice) => void
  dependencies.chooseClose.mockImplementation(
    () =>
      new Promise(resolve => {
        choose = resolve
      })
  )
  dependencies.resolveChoice.mockImplementation(value => choose(value))
  const closing = controller.receive({ requestId: "same-ticket", intent: "close-button" })
  await controller.receive({ requestId: "same-ticket", intent: "explicit-exit" })
  await closing
  expect(dependencies.resolveChoice).toHaveBeenCalledWith("quit")
  expect(dependencies.confirmDiscard).toHaveBeenCalledOnce()
  expect(dependencies.native.resolve).toHaveBeenCalledWith("same-ticket", "exit")
})

it("does not complete an old authorization after lifecycle disposal", async () => {
  const { dependencies, controller } = setup()
  let approve!: (discard: boolean) => void
  dependencies.confirmDiscard.mockImplementation(
    () =>
      new Promise(resolve => {
        approve = resolve
      })
  )
  const quitting = controller.receive({ requestId: "quit", intent: "explicit-exit" })
  controller.dispose()
  expect(dependencies.cancelDiscard).toHaveBeenCalledOnce()
  approve(true)
  await quitting
  expect(dependencies.native.resolve).not.toHaveBeenCalled()
})

it("cancels the native ticket on a failed save guard instead of dropping the process", async () => {
  const { dependencies, controller } = setup()
  const failure = new Error("Save failed")
  dependencies.confirmDiscard.mockRejectedValue(failure)
  await controller.receive({ requestId: "quit", intent: "explicit-exit" })
  expect(dependencies.onError).toHaveBeenLastCalledWith(failure)
  expect(dependencies.native.resolve).toHaveBeenCalledWith("quit", "cancel")
})
