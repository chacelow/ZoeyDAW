import { useTheme } from "@/shared/theme/ThemeProvider"
import type { Device } from "@/project/model/devices"
import { Shape } from "@/shared/svg/Shape"
import { DEVICE_GRID_PATH, deviceResponsePath } from "./response"

export function DeviceDisplay({ device }: { readonly device: Device }) {
  const theme = useTheme()
  return (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        minHeight: theme.control["--spacing-control-track"],
        flexGrow: 1,
        backgroundColor: theme.colors.background,
      }}
    >
      <Shape
        width={200}
        height={60}
        paths={[{ d: DEVICE_GRID_PATH }]}
        color={theme.colors.border}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
      />
      <Shape
        width={200}
        height={60}
        paths={[{ d: deviceResponsePath(device), strokeWidth: 2 }]}
        color={theme.colors.primary}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  )
}
