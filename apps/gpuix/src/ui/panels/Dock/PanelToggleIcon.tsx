import { useTheme } from "@/shared/theme/ThemeProvider"
import { Shape } from "@/shared/svg/Shape"
import { Icon } from "@/ui/controls/Icon"
import type { DockBorderSide } from "./model"

const PANEL_FILL = {
  left: "M3 3H9V21H3Z",
  right: "M15 3H21V21H15Z",
  bottom: "M3 15H21V21H3Z",
}
export function PanelToggleIcon({ side, open }: { side: DockBorderSide; open: boolean }) {
  const theme = useTheme()
  const size = theme.control["--spacing-control-icon"]
  return <div style={{ position: "relative", width: size, height: size, pointerEvents: "none" }}>
    <Icon name={side === "left" ? "PanelLeft" : side === "right" ? "PanelRight" : "PanelBottom"} color={theme.colors.foreground} />
    {open ? <Shape width={size} height={size} viewBox="0 0 24 24" paths={[{ d: PANEL_FILL[side], fill: true }]} color={theme.colors.foreground} style={{ position: "absolute", left: 0, top: 0 }} /> : null}
  </div>
}
