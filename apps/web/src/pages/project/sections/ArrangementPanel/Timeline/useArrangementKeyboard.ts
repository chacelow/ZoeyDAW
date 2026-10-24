import { useEffect } from "react"
import { projectActions, projectFiles, useProjectState } from "@/pages/project/adapters"
import { isEditableTarget } from "../Grid/geometry"
import { arrangementScene } from "../canvas/scene"
import { noteKeys } from "./useMidiKeyboard"
import { drawModeKeyDown, useDrawModeKeyRelease } from "./drawModeKey"

export function useArrangementKeyboard({
  snapshots = true,
}: { readonly snapshots?: boolean } = {}) {
  useDrawModeKeyRelease()
  useEffect(() => {
    function transportSpace(event: KeyboardEvent) {
      if (
        (event.code !== "Space" && event.key !== " ") ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.isComposing ||
        isEditableTarget(event.target)
      ) {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.type === "keydown" && !event.repeat) {
        const focused = document.activeElement
        if (
          focused instanceof HTMLElement &&
          focused.matches('button,[role="button"],[role="slider"],[role="menuitem"]')
        ) {
          focused.blur()
        }
        projectActions.togglePlay()
      }
    }
    function keyDown(event: KeyboardEvent) {
      if (
        !event.defaultPrevented &&
        !event.isComposing &&
        !event.altKey &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault()
        if (snapshots && !event.repeat)
          void (event.shiftKey ? projectFiles.saveAs() : projectFiles.save())
        return
      }
      if (
        event.defaultPrevented ||
        isEditableTarget(event.target) ||
        (event.target instanceof Element &&
          !!event.target.closest('[data-clip-editor], [role="menu"], [role="menuitem"]'))
      ) {
        return
      }
      if (
        event.target instanceof Element &&
        event.target.closest("button,[role=slider],[role=menuitem]") &&
        event.key === "Enter"
      ) {
        return
      }
      if (event.key === "Escape") {
        projectActions.setEditingClip(null)
        projectActions.cancelEdit()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) {
          projectActions.redo()
        } else {
          projectActions.undo()
        }
        return
      }
      if (
        event.target instanceof Element &&
        event.target.closest('[role="tab"], [role="tablist"]')
      ) {
        return
      }
      if (
        document.querySelector(
          '[data-workspace-panel="arrangement"][data-workspace-visible="false"]'
        )
      ) {
        return
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"].includes(event.code)
      ) {
        const target = event.target
        const background =
          target === window ||
          target === document ||
          target === document.body ||
          target === document.documentElement
        const surface =
          (background &&
            !isEditableTarget(document.activeElement) &&
            !(
              document.activeElement instanceof Element &&
              document.activeElement.closest(
                '[data-clip-editor], [role="menu"], [role="tab"], [role="tablist"], [data-workspace-panel="browser"], button, [role="slider"], input, textarea, select'
              )
            )) ||
          (target instanceof Element &&
            !!target.closest(
              "[data-arrangement-panel], [data-transport-header], [data-workspace-panel='arrangement']"
            ) &&
            (!target.closest(
              "button,[role='button'],[role='slider'],[role='tab'],[role='menuitem']"
            ) ||
              !!target.closest(".project-arrangement-toolbar, [data-transport-header]")))
        if (!surface) {
          return
        }
        event.preventDefault()
        if (!event.repeat) {
          switch (event.code) {
            case "Digit1":
            case "Digit2":
              projectActions.adjustGrid(event.code === "Digit2" ? 1 : -1)
              break
            case "Digit3":
              projectActions.toggleTriplet()
              break
            case "Digit4":
              projectActions.toggleSnap()
              break
            case "Digit5":
              projectActions.toggleFixedGrid()
              break
          }
        }
        return
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.code === "KeyE" &&
        !useProjectState.getState().session.selectedClipIds.length &&
        event.target instanceof Element &&
        event.target.closest("[data-arrangement-canvas-host]")
      ) {
        event.preventDefault()
        return
      }
      if (event.altKey || event.metaKey || event.ctrlKey) {
        return
      }
      if (event.key === "Home") {
        projectActions.rewindToStart()
        return
      }
      if (event.repeat) {
        return
      }
      const state = useProjectState.getState()
      const mode = state.workspace
      const key = event.key.toLowerCase()
      if (key === "m") {
        return
      }
      if (
        mode.computerKeyboard &&
        (Object.hasOwn(noteKeys, key) || ["z", "x", "c", "v"].includes(key))
      ) {
        return
      }
      if (drawModeKeyDown(event)) {
        event.preventDefault()
        return
      }
      if (key === "a") {
        projectActions.setMode("automationMode", !mode.automationMode)
      }
      if (
        !mode.automationMode &&
        (event.key === "Delete" || event.key === "Backspace") &&
        state.session.selectedClipIds.length
      ) {
        projectActions.deleteClips(state.session.selectedClipIds)
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault()
        const current = state.session.position
        const bar =
          current.bar +
          (current.beat - 1 + (current.sixteenth - 1) / 4) / state.document.transport.numerator
        projectActions.seekBar(
          Math.max(
            1,
            bar +
              (event.key === "ArrowRight"
                ? arrangementScene.get().gridPlan.cellBars
                : -arrangementScene.get().gridPlan.cellBars)
          )
        )
      }
    }
    window.addEventListener("keydown", transportSpace, { capture: true })
    window.addEventListener("keyup", transportSpace, { capture: true })
    window.addEventListener("keydown", keyDown)
    return () => {
      window.removeEventListener("keydown", transportSpace, true)
      window.removeEventListener("keyup", transportSpace, true)
      window.removeEventListener("keydown", keyDown)
    }
  }, [snapshots])
}
