import { Check, Monitor, Moon, Palette, Sun } from "lucide-react"
import {
  Button,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  ScrollArea,
  THEME_PRESETS,
  ToggleGroup,
  ToggleGroupItem,
  cn,
  useTheme,
} from "@zoeymind/ui"
import { useTranslation } from "@zoeymind/i18n"
import { useThemePreset } from "./theme-preset-context"
import type { Theme, ThemePreset } from "@zoeymind/ui"

const THEME_MODES: { mode: Theme; icon: typeof Sun; labelKey: string }[] = [
  { mode: "light", icon: Sun, labelKey: "ui.theme.light" },
  { mode: "dark", icon: Moon, labelKey: "ui.theme.dark" },
  { mode: "system", icon: Monitor, labelKey: "ui.theme.system" },
]

export interface ThemeMenuProps {
  readonly variant?: "icon" | "sub" | "inline"
}

interface PresetOptionProperties {
  readonly preset: ThemePreset
  readonly active: boolean
  readonly onSelect: () => void
}

function PresetOption({ preset, active, onSelect }: PresetOptionProperties) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "group hover:bg-muted focus-visible:ring-ring/50 relative flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-lg p-1.5 text-left transition-[background-color,box-shadow] outline-none focus-visible:ring-2",
        active && "bg-accent ring-ring/25 shadow-sm ring-1"
      )}
    >
      <span className="flex h-9 w-full overflow-hidden rounded-md shadow-[inset_0_0_0_1px_var(--border)]">
        {preset.preview.map((color, index) => (
          <span key={index} className="flex-1" style={{ backgroundColor: color }} />
        ))}
      </span>
      {active ? (
        <span className="bg-primary text-primary-foreground absolute top-2 right-2 flex size-5 items-center justify-center rounded-full shadow-sm">
          <Check aria-hidden="true" />
        </span>
      ) : null}
      <span
        className={cn(
          "text-muted-foreground group-hover:text-foreground truncate px-0.5 text-xs",
          active && "text-foreground font-medium"
        )}
      >
        {preset.label}
      </span>
    </button>
  )
}

export function ThemeModeToggle() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()

  return (
    <ToggleGroup
      type="single"
      value={theme}
      onValueChange={value => {
        if (value) {
          setTheme(value as Theme)
        }
      }}
      variant="default"
      size="sm"
      spacing={0}
      className="bg-muted/60 w-full p-1"
      aria-label={t("common.themePreset")}
    >
      {THEME_MODES.map(({ mode, icon: Icon, labelKey }) => (
        <ToggleGroupItem key={mode} value={mode} className="flex-1 gap-1.5 px-2">
          <Icon aria-hidden="true" />
          <span>{t(labelKey)}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function ThemePresetGrid() {
  const { presetId, setPreset } = useThemePreset()

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {THEME_PRESETS.map(preset => (
        <PresetOption
          key={preset.id || "default"}
          preset={preset}
          active={presetId === preset.id}
          onSelect={() => setPreset(preset.id)}
        />
      ))}
    </div>
  )
}

function ThemeContent({ scroll = false }: { readonly scroll?: boolean }) {
  const presets = <ThemePresetGrid />

  return (
    <div className="flex min-h-0 flex-col gap-2.5 p-2.5">
      <ThemeModeToggle />
      {scroll ? <ScrollArea className="h-80 pr-2">{presets}</ScrollArea> : presets}
    </div>
  )
}

export function ThemeMenu({ variant = "icon" }: ThemeMenuProps) {
  const { t } = useTranslation()

  if (variant === "sub") {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2">
          <Palette />
          {t("common.themePreset")}
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="w-64 p-0">
            <div className="border-b px-3 py-2 text-sm font-medium">{t("common.themePreset")}</div>
            <div className="max-h-[min(400px,var(--available-height))] overflow-y-auto">
              <ThemeContent />
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    )
  }

  if (variant === "inline") {
    return <ThemeContent />
  }

  return (
    <Popover>
      <PopoverTrigger
        nativeButton
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={t("common.themePreset")}
            title={t("common.themePreset")}
          >
            <Palette className="size-7" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 gap-0 p-0">
        <PopoverHeader className="border-b px-3 py-2.5">
          <PopoverTitle>{t("common.themePreset")}</PopoverTitle>
        </PopoverHeader>
        <ThemeContent scroll />
      </PopoverContent>
    </Popover>
  )
}
