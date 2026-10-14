// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, within } from "@testing-library/react"
import { DragPadToggle } from "@zoeymind/ui"
import { ControlEnvironmentBridge } from "@/components/SharedControlBridge"
import { ControlInteractionsProvider, useControlInteractions } from "."

afterEach(cleanup)

function Scope({ name }: { readonly name: string }) {
  const mappingActive = useControlInteractions(state => state.mappingActive)
  const toggleMapping = useControlInteractions(state => state.toggleMapping)
  const info = useControlInteractions(state => state.info)
  const warnings = useControlInteractions(state => state.warnings)
  const pushWarning = useControlInteractions(state => state.pushWarning)

  return (
    <section aria-label={name}>
      <button type="button" onClick={toggleMapping}>
        Mapping
      </button>
      <button
        type="button"
        onClick={() => pushWarning({ id: "alert", message: name, severity: "warning" })}
      >
        Warning
      </button>
      <DragPadToggle value={false} onChange={() => {}} label="Hover target" />
      <output>{`${mappingActive ? "on" : "off"} / ${info ?? "none"} / ${warnings.length}`}</output>
    </section>
  )
}

describe("control interaction ownership", () => {
  it("keeps mapping, warnings and shared-control hover info within each provider", () => {
    const { getByRole } = render(
      <>
        <ControlInteractionsProvider>
          <ControlEnvironmentBridge>
            <Scope name="Application" />
          </ControlEnvironmentBridge>
        </ControlInteractionsProvider>
        <ControlInteractionsProvider>
          <ControlEnvironmentBridge>
            <Scope name="Gallery" />
          </ControlEnvironmentBridge>
        </ControlInteractionsProvider>
      </>
    )
    const app = within(getByRole("region", { name: "Application" }))
    const gallery = within(getByRole("region", { name: "Gallery" }))

    fireEvent.click(gallery.getByRole("button", { name: "Mapping" }))
    fireEvent.click(gallery.getByRole("button", { name: "Warning" }))
    fireEvent.pointerEnter(gallery.getByRole("button", { name: "Hover target" }))

    expect(gallery.getByRole("status").textContent).toBe("on / toggle / 1")
    expect(app.getByRole("status").textContent).toBe("off / none / 0")
    fireEvent.pointerEnter(app.getByRole("button", { name: "Hover target" }))
    expect(app.getByRole("status").textContent).toBe("off / toggle / 0")
    expect(gallery.getByRole("status").textContent).toBe("on / toggle / 1")
  })
})
