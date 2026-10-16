import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { useState } from "react"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import {
  Button,
  Popover,
  PopoverTrigger,
  PopoverContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/ui/controls"

for (const kind of ["popover", "menu"] as const) {
  test(`${kind} Enter preserves slotted Button callbacks exactly once before consuming`, () => {
    const clicks: string[] = []
    const activations: boolean[] = []
    const open: boolean[] = []
    const windowKeys: string[] = []
    const root = createTestRoot({
      width: 400,
      height: 240,
      onKeyDown: event => {
        windowKeys.push(event.key ?? "")
      },
    })
    function Harness() {
      const [active, setActive] = useState(false)
      const child = (
        <Button
          testId="slot-button"
          active={active}
          onActiveChange={value => {
            activations.push(value)
            setActive(value)
          }}
          onClick={() => {
            clicks.push("activate")
          }}
        >
          {active ? "Child on" : "Child off"}
        </Button>
      )
      return (
        <ThemeProvider>
          {kind === "popover" ? (
            <Popover
              onOpenChange={value => {
                open.push(value)
              }}
            >
              <PopoverTrigger asChild>{child}</PopoverTrigger>
              <PopoverContent testId="slot-content">Details</PopoverContent>
            </Popover>
          ) : (
            <DropdownMenu
              onOpenChange={value => {
                open.push(value)
              }}
            >
              <DropdownMenuTrigger asChild>{child}</DropdownMenuTrigger>
              <DropdownMenuContent testId="slot-content">
                <DropdownMenuItem testId="slot-first">First command</DropdownMenuItem>
                <DropdownMenuItem testId="slot-last">Last command</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </ThemeProvider>
      )
    }
    try {
      root.render(<Harness />)
      const button = root.renderer.findByTestId("slot-button")
      if (!button) throw new Error("Missing slotted Button")
      root.renderer.nativeSimulateKeystrokes(button.id, "enter")
      expect(activations).toEqual([true])
      expect(clicks).toEqual(["activate"])
      expect(open).toEqual([true])
      expect(root.renderer.getAllText()).toContain("Child on")
      expect(root.renderer.findByTestId("slot-content")).toBeDefined()
      expect(windowKeys).toEqual([])
      root.renderer.nativeSimulateKeystrokes(button.id, "enter")
      expect(activations).toEqual([true, false])
      expect(clicks).toEqual(["activate", "activate"])
      expect(open).toEqual([true, false])
      expect(root.renderer.getAllText()).toContain("Child off")
      expect(root.renderer.findByTestId("slot-content")).toBeUndefined()
      expect(windowKeys).toEqual([])
      if (kind === "menu") {
        root.renderer.nativeSimulateKeystrokes(button.id, "up")
        const last = root.renderer.findByTestId("slot-last")
        if (!last) throw new Error("Missing last menu item")
        expect(root.renderer.getFocusedElementId()).toBe(last.id)
        root.renderer.nativeSimulateKeystrokes(last.id, "escape")
        root.renderer.nativeSimulateKeystrokes(button.id, "enter")
        const first = root.renderer.findByTestId("slot-first")
        if (!first) throw new Error("Missing first menu item")
        expect(root.renderer.getFocusedElementId()).toBe(first.id)
        expect(activations).toEqual([true, false, true])
        expect(clicks).toEqual(["activate", "activate", "activate"])
        expect(windowKeys).toEqual([])
      }
    } finally {
      root.unmount()
    }
  })
}
