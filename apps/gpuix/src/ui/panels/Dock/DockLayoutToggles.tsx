import { useTheme } from "@/shared/theme/ThemeProvider"
import { ToolbarIconButton, IconSlot } from "@/ui/controls"
import { dockBorderSides, toggleBorderVisible } from "./model"
import { PanelToggleIcon } from "./PanelToggleIcon"
import type { DockLayoutProps } from "./index"

export function DockLayoutToggles({ layout, onLayoutChange, labels, testId = "dock-layout" }: Pick<DockLayoutProps, "layout" | "onLayoutChange" | "labels" | "testId">) {
  const theme = useTheme()
  return <div style={{ display: "flex", height: "100%", alignItems: "center", gap: theme.control["--spacing-control-gap"], marginRight: theme.control["--spacing-control-track-gap"] }}>
    {dockBorderSides.map(side => {
      const border = layout.borders[side]
      const open = Boolean(border && border.visible !== false)
      return <ToolbarIconButton
        key={side} testId={`${testId}-${side}`}
        label={labels[side]} aria-pressed={open} disabled={!border}
        onClick={() => onLayoutChange(toggleBorderVisible(layout, side))}
      ><IconSlot><PanelToggleIcon side={side} open={open} /></IconSlot></ToolbarIconButton>
    })}
  </div>
}
