import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import { Switch } from "."

for (const reducedMotion of [false, true])
  test(`switch thumb ${reducedMotion ? "moves immediately with reduced motion" : "slides through intermediate positions"}`, () => {
    const root = createTestRoot({ width: 200, height: 100 })
    let duration = 0
    function Fixture({ checked }: { checked: boolean }) {
      const theme = useTheme()
      duration = theme.design.motion.switch.duration * 1000
      return (
        <Switch
          testId="switch"
          label="Monitor"
          checked={checked}
          onCheckedChange={() => {}}
          reducedMotion={reducedMotion}
        />
      )
    }
    const render = (checked: boolean) => root.render(
      <ThemeProvider><Fixture checked={checked} /></ThemeProvider>
    )
    const thumbX = () => {
      const control = root.renderer.findByTestId("switch")
      const node = root.renderer.findByType("div").filter(node => node.parentId === control?.id)[1]
      const bounds = node && root.renderer.getElementBounds(node.id)
      if (!bounds) throw new Error("Switch thumb not painted")
      return bounds.x
    }
    try {
      root.renderer.clockSet(0)
      render(false)
      const start = thumbX()
      render(true)
      const immediate = thumbX()
      root.renderer.clockFastForward(duration / 2)
      root.renderer.flush()
      const halfway = thumbX()
      root.renderer.clockFastForward(duration)
      root.renderer.flush()
      const end = thumbX()
      expect(end).toBeGreaterThan(start)
      if (reducedMotion) {
        expect(immediate).toBe(end)
        expect(halfway).toBe(end)
      } else {
        expect(immediate).toBe(start)
        expect(halfway).toBeGreaterThan(start)
        expect(halfway).toBeLessThan(end)
      }
      render(false)
      root.renderer.clockFastForward(duration * 2)
      root.renderer.flush()
      expect(thumbX()).toBe(start)
    } finally {
      root.unmount()
    }
  })
