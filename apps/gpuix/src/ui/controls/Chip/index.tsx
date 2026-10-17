import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Button } from "../Button"
import { Icon } from "../Icon"
import type { ButtonProps } from "../Button"

export interface ChipProps extends Omit<ButtonProps, "active" | "onActiveChange"> {
  readonly selected?: boolean
  readonly onSelectedChange?: (selected: boolean) => void
  readonly remove?: { readonly label: string; readonly onRemove: () => void }
}

export function Chip({
  selected = false,
  onSelectedChange,
  remove,
  children,
  style,
  disabled,
  ...props
}: ChipProps) {
  const theme = useTheme()
  const chipStyle = { borderRadius: theme.design.chip.radius }
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: theme.design.spacing.joinedGroupGap }}
    >
      <Button
        {...props}
        disabled={disabled}
        active={selected}
        onActiveChange={onSelectedChange}
        style={sx(chipStyle, style)}
      >
        {children}
      </Button>
      {remove ? (
        <Button
          disabled={disabled}
          label={remove.label}
          iconOnly
          variant="ghost"
          icon={<Icon name="X" />}
          onClick={remove.onRemove}
        />
      ) : null}
    </div>
  )
}
