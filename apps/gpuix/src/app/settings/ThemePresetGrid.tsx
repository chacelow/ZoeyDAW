import { useGpuix } from "@gpuix/react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { THEME_PRESETS, isThemePresetId } from "@/shared/theme/presets"
import { ScrollArea, ToggleGroup, ToggleGroupItem } from "@/ui/controls"
import { Icon } from "@/ui/controls/Icon"
import type { ThemePresetId } from "@/shared/theme/presets"

export interface ThemePresetGridProps {
  readonly value: ThemePresetId
  readonly onValueChange: (preset: ThemePresetId) => void
  readonly label: string
}

/**
 * Web parity (apps/web/src/shared/app-shared/ThemeMenu.tsx `ThemePresetGrid`): two columns,
 * each option a three-color strip, a check badge when selected and the preset name. Built
 * from ToggleGroup so selection, Enter and arrow keys follow the shared control.
 */
export function ThemePresetGrid({ value, onValueChange, label }: ThemePresetGridProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const gap = theme.control["--spacing-control-track-gap"]
  const swatchHeight = theme.control["--spacing-control-track"] * 2
  const columnWidth = theme.project.identityWidth * 2
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={next => {
        if (isThemePresetId(next)) onValueChange(next)
      }}
      orientation="vertical"
      aria-label={label}
    >
      {/* Each option is a direct scroll child: native scrollIntoView addresses child indices. */}
      <ScrollArea
        testId="theme-preset-scroll"
        aria-label={label}
        height={theme.project.defaultTrackHeight * 4}
        style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap, flexShrink: 0 }}
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
                // ToggleGroupItem moved focus before invoking this callback.
                const focused = renderer?.getFocusedElementId?.()
                if (focused !== null && focused !== undefined) renderer?.scrollIntoView?.(focused)
              }}
              style={{
                position: "relative",
                flexDirection: "column",
                alignItems: "stretch",
                gap,
                width: columnWidth,
                height: "auto",
                padding: gap,
              }}
            >
              <div
                style={{
                  pointerEvents: "none",
                  display: "flex",
                  flexDirection: "row",
                  height: swatchHeight,
                  borderWidth: 1,
                  borderRadius: theme.control["--spacing-control-gap"],
                  borderColor: theme.colors.border,
                  overflow: "hidden",
                }}
              >
                {/* Web's light-mode preview swatches: background, primary, accent. */}
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
              </div>
              {selected ? (
                <div
                  style={{
                    pointerEvents: "none",
                    position: "absolute",
                    top: gap * 2,
                    right: gap * 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: theme.control["--spacing-control-track"],
                    height: theme.control["--spacing-control-track"],
                    borderRadius: theme.control["--spacing-control-track"],
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
              <text
                style={{
                  pointerEvents: "none",
                  color: selected ? theme.colors.foreground : theme.colors.mutedForeground,
                  fontWeight: selected ? 500 : undefined,
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
      </ScrollArea>
    </ToggleGroup>
  )
}
