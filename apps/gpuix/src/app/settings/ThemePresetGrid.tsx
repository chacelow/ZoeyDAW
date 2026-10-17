import { useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { THEME_PRESETS, isThemePresetId } from "@/shared/theme/presets"
import { ToggleGroup, ToggleGroupItem } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import type { ThemePresetId } from "@/shared/theme/presets"

export interface ThemePresetGridProps {
  readonly value: ThemePresetId | null
  readonly onValueChange: (preset: ThemePresetId) => void
  readonly label: string
}

export function ThemePresetGrid({ value, onValueChange, label }: ThemePresetGridProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const gap = theme.design.settings.itemGap
  const swatchHeight = theme.design.settings.presetGrid.swatchHeight
  const columnWidth = theme.design.settings.presetGrid.columnWidth
  return (
    <ToggleGroup
      type="single"
      value={value ?? ""}
      onValueChange={next => {
        if (isThemePresetId(next)) onValueChange(next)
      }}
      orientation="vertical"
      aria-label={label}
      style={{ width: "100%" }}
    >
      <div
        testId="theme-preset-grid"
        style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap, width: "100%" }}
      >
        {THEME_PRESETS.map(preset => {
          const selected = preset.id === value
          return (
            <ToggleGroupItem
              key={preset.id}
              value={preset.id}
              testId={`theme-preset-${preset.id}`}
              aria-label={preset.label}
              onKeyDown={event => {
                if (event.key === "space" || event.key === " ") {
                  event.preventDefault()
                  if (!event.isHeld) onValueChange(preset.id)
                }
                if (!["up", "down", "home", "end"].includes(event.key ?? "")) return
                const focused = renderer?.getFocusedElementId?.()
                if (focused !== null && focused !== undefined) renderer?.scrollIntoView?.(focused)
              }}
              style={{
                position: "relative",
                flexDirection: "column",
                alignItems: "stretch",
                gap,
                flexBasis: columnWidth,
                flexGrow: 1,
                minWidth: columnWidth,
                height: "auto",
                padding: gap,
              }}
            >
              <div
                style={{
                  pointerEvents: "none",
                  position: "relative",
                  display: "flex",
                  flexDirection: "row",
                  height: swatchHeight,
                  borderWidth: theme.design.shape.controlBorderWidth,
                  borderRadius: theme.design.shape.controlRadius,
                  borderColor: theme.colors.border,
                  overflow: "hidden",
                }}
              >
                {[
                  preset.colors.light.background,
                  preset.colors.light.primary,
                  preset.colors.light.accent,
                ].map((color, index) => (
                  <div
                    key={index}
                    style={{ flexGrow: 1, backgroundColor: color, pointerEvents: "none" }}
                  />
                ))}
                {selected ? (
                  <div
                    style={{
                      pointerEvents: "none",
                      position: "absolute",
                      top: gap,
                      right: gap,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: theme.control["--spacing-control-track"],
                      height: theme.control["--spacing-control-track"],
                      borderRadius: theme.design.shape.indicatorRadius,
                      backgroundColor: theme.colors.primary,
                    }}
                  >
                    <Icon
                      name="Check"
                      size={theme.control["--spacing-control-icon"]}
                      color={theme.colors.primaryForeground}
                    />
                  </div>
                ) : null}
              </div>
              <text
                style={{
                  pointerEvents: "none",
                  color: selected ? theme.colors.foreground : theme.colors.mutedForeground,
                  fontWeight: selected ? theme.design.typography.weights.medium : undefined,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {preset.label}
              </text>
            </ToggleGroupItem>
          )
        })}
      </div>
    </ToggleGroup>
  )
}
