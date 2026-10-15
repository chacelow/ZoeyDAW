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
  const gap = theme.control["--spacing-control-track-gap"]
  const swatchHeight = theme.control["--spacing-control-track"] * 2
  const columnWidth = theme.project.identityWidth * 2
  return (
    <ScrollArea
      aria-label={label}
      height={theme.project.defaultTrackHeight * 4}
      style={{ flexShrink: 0 }}
    >
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={next => {
          if (isThemePresetId(next)) onValueChange(next)
        }}
        orientation="vertical"
        aria-label={label}
        style={{ flexDirection: "row", flexWrap: "wrap", gap }}
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
                if (event.key !== "space" && event.key !== " ") return
                event.preventDefault()
                if (!event.isHeld) onValueChange(preset.id)
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
      </ToggleGroup>
    </ScrollArea>
  )
}
