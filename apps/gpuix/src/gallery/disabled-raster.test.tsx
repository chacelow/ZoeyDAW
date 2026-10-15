import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createTestRoot } from "@gpuix/react/testing"
import { ThemeProvider, useTheme } from "@/shared/theme/ThemeProvider"
import {
  Button,
  ToggleGroup,
  ToggleGroupItem,
  MotionTabs,
  SettingsNavItem,
  ListRow,
} from "@/ui/controls"
import type { ButtonProps } from "@/ui/controls"

type Owner = "Button" | "ToggleGroup" | "MotionTabs" | "SettingsNavItem" | "ListRow"
function DisabledSpecimen({
  owner,
  variant,
  selected,
  onActivate,
}: {
  readonly owner: Owner
  readonly variant: ButtonProps["variant"]
  readonly selected: boolean
  readonly onActivate: () => void
}) {
  const theme = useTheme()
  const control =
    owner === "Button" ? (
      <Button testId="target" disabled variant={variant} active={selected} onClick={onActivate}>
        Unavailable
      </Button>
    ) : owner === "ToggleGroup" ? (
      <ToggleGroup type="single" value={selected ? "a" : ""} onValueChange={onActivate}>
        <ToggleGroupItem testId="target" disabled value="a">
          Unavailable
        </ToggleGroupItem>
      </ToggleGroup>
    ) : owner === "MotionTabs" ? (
      <MotionTabs
        reducedMotion
        options={[
          { key: "a", label: "First" },
          { key: "b", label: "Unavailable", disabled: true },
        ]}
        tabWidth={theme.project.identityWidth}
        onChange={onActivate}
        showContent={false}
      />
    ) : owner === "ListRow" ? (
      <ListRow
        testId="target"
        label="Unavailable"
        disabled
        selected={selected}
        onClick={onActivate}
        style={{ width: theme.project.identityWidth * 2 }}
      />
    ) : (
      <SettingsNavItem
        testId="target"
        item={{ id: "a", label: "Unavailable", disabled: true }}
        selected={selected}
        onSelect={onActivate}
      />
    )
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: theme.colors.background,
        color: theme.colors.foreground,
        padding: theme.project.panelGap,
        display: "flex",
        alignItems: "start",
      }}
    >
      {control}
    </div>
  )
}

for (const appearance of ["dark", "light"] as const)
  for (const owner of [
    "Button",
    "ToggleGroup",
    "MotionTabs",
    "SettingsNavItem",
    "ListRow",
  ] as const) {
    const variants: ButtonProps["variant"][] =
      owner === "Button"
        ? ["default", "outline", "secondary", "ghost", "destructive", "link"]
        : ["default"]
    for (const variant of variants)
      for (const selected of owner === "MotionTabs" ? [false] : [false, true]) {
        test(`${owner} disabled idle/hover/pressed retain ${selected ? "selected" : "unselected"} raster (${appearance}/${variant})`, () => {
          const directory = mkdtempSync(path.join(tmpdir(), "disabled-raster-"))
          const image = path.join(directory, "frame.png")
          const root = createTestRoot({ width: 260, height: 80 })
          let activations = 0
          try {
            root.render(
              <ThemeProvider appearance={appearance}>
                <DisabledSpecimen
                  owner={owner}
                  variant={variant}
                  selected={selected}
                  onActivate={() => {
                    activations++
                  }}
                />
              </ThemeProvider>
            )
            root.renderer.clockPause()
            root.renderer.nativeSimulateMouseMove(255, 75)
            const node =
              owner === "MotionTabs"
                ? root.renderer
                    .findByType("div")
                    .filter(element => element.customProps?.role === "tab")[1]
                : root.renderer.findByTestId("target")
            const bounds = node && root.renderer.getElementBounds(node.id)
            if (!node || !bounds) throw new Error("Missing disabled specimen")
            root.renderer.captureScreenshot(image)
            const idle = readFileSync(image)
            const x = bounds.x + bounds.width / 2
            const y = bounds.y + bounds.height / 2
            root.renderer.nativeSimulateMouseMove(x, y)
            root.renderer.captureScreenshot(image)
            expect(readFileSync(image).equals(idle)).toBe(true)
            root.renderer.nativeSimulateMouseDown(x, y)
            root.renderer.captureScreenshot(image)
            expect(readFileSync(image).equals(idle)).toBe(true)
            root.renderer.nativeSimulateMouseUp(x, y)
            expect(root.renderer.getElementBounds(node.id)).toEqual(bounds)
            expect(activations).toBe(0)
          } finally {
            root.unmount()
            rmSync(directory, { recursive: true, force: true })
          }
        })
      }
  }
