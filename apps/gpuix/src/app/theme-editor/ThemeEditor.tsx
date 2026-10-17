import { useState } from "react"
import { useGpuix } from "@gpuix/react"
import { readTextFile } from "@/platform/storage"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { ThemePresetGrid } from "../settings/ThemePresetGrid"
import { Button, Input, DragPadNumber, Label, Separator } from "@/ui/controls"
import { isThemePresetId } from "@/shared/theme/presets"
import {
  activeCustomTheme,
  deleteCustomTheme,
  duplicateCurrentTheme,
  importCustomTheme,
  isValidThemeField,
  readThemeField,
  resetThemeGroup,
  resolveThemeOverrides,
  setThemeField,
  updateCustomTheme,
} from "./model"
import type { CustomTheme, ThemeLibrary } from "./model"
import { THEME_FIELDS, THEME_GROUPS } from "./schema"
import type { ThemeField } from "./schema"
import { importVSCodeTheme } from "./vscode-import"

export interface ThemeEditorProps {
  readonly value: ThemeLibrary
  readonly onChange: (value: ThemeLibrary) => void
  readonly t: (key: string) => string
}
export function ThemeEditor({ value, onChange, t }: ThemeEditorProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const custom = activeCustomTheme(value)
  const [open, setOpen] = useState<Partial<Record<string, boolean>>>({ colors: true })
  const [resetRevision, setResetRevision] = useState<Partial<Record<string, number>>>({})
  const [json, setJson] = useState("")
  const [importInvalid, setImportInvalid] = useState(false)
  const [includeWarning, setIncludeWarning] = useState(false)
  const importVSCode = (text: string) => {
    const imported = importVSCodeTheme(text, {
      id: `custom:${crypto.randomUUID()}`,
      fallbackName: t("themeEditor.vscodeName"),
    })
    setImportInvalid(!imported.ok)
    setIncludeWarning(imported.ok && imported.unresolvedInclude)
    if (imported.ok)
      onChange({ selection: imported.theme.id, themes: [...value.themes, imported.theme] })
  }
  const gap = theme.design.settings.itemGap
  const column = { display: "flex", flexDirection: "column", gap, flexShrink: 0 } as const
  const row = {
    display: "flex",
    flexDirection: "row",
    gap,
    alignItems: "center",
    flexWrap: "wrap",
  } as const
  const resolved = resolveThemeOverrides(value, theme.appearance)
  const fieldValues = {
    colors: {
      light: resolveThemeOverrides(value, "light").colors,
      dark: resolveThemeOverrides(value, "dark").colors,
    },
    design: resolved.design,
    control: { default: resolved.control, transport: resolved.transportControl },
    project: resolved.project,
  }
  return (
    <div testId="theme-editor" style={column}>
      <Label>{t("themeEditor.builtins")}</Label>
      <ThemePresetGrid
        value={isThemePresetId(value.selection) ? value.selection : null}
        onValueChange={selection => onChange({ ...value, selection })}
        label={t("themeEditor.builtins")}
      />
      <Label>{t("themeEditor.custom")}</Label>
      {value.themes.map(item => (
        <Button
          key={item.id}
          active={value.selection === item.id}
          testId={`theme-editor-select-${item.id}`}
          onClick={() => onChange({ ...value, selection: item.id })}
        >
          {item.name}
        </Button>
      ))}
      <Button
        testId="theme-editor-new"
        onClick={() => onChange(duplicateCurrentTheme(value, t("themeEditor.newName")))}
      >
        {t("themeEditor.new")}
      </Button>
      {custom ? (
        <>
          <Input
            testId="theme-editor-name"
            aria-label={t("themeEditor.name")}
            value={custom.name}
            onValueChange={name => {
              if (name.trim()) onChange(updateCustomTheme(value, { ...custom, name }))
            }}
          />
          <div style={row}>
            <Button
              testId="theme-editor-delete"
              onClick={() => onChange(deleteCustomTheme(value, custom.id))}
            >
              {t("themeEditor.delete")}
            </Button>
            <Button
              testId="theme-editor-export"
              onClick={() => {
                setJson(JSON.stringify(custom, null, 2))
                setImportInvalid(false)
              }}
            >
              {t("themeEditor.export")}
            </Button>
          </div>
          <Label>{t("themeEditor.fontFamily")}</Label>
          <Input
            testId="theme-editor-font"
            value={resolved.design.typography.numberFontFamily}
            aria-label={t("themeEditor.fontFamily")}
            onValueChange={font => {
              if (font.trim() && font.length <= 128)
                onChange(
                  updateCustomTheme(
                    value,
                    setThemeField(custom, "design.typography.numberFontFamily", font)
                  )
                )
            }}
          />
          {THEME_GROUPS.map(group => (
            <div key={group} style={column}>
              <Separator />
              <div style={row}>
                <Button
                  testId={`theme-editor-group-${group}`}
                  active={open[group] ?? false}
                  onClick={() =>
                    setOpen(current => ({ ...current, [group]: current[group] !== true }))
                  }
                >
                  {t(`themeEditor.groups.${group}`)}
                </Button>
                <Button
                  testId={`theme-editor-reset-${group}`}
                  onClick={() => {
                    onChange(updateCustomTheme(value, resetThemeGroup(custom, group)))
                    setResetRevision(current => ({
                      ...current,
                      [group]: (current[group] ?? 0) + 1,
                    }))
                  }}
                >
                  {t("themeEditor.resetGroup")}
                </Button>
              </div>
              {open[group] === true
                ? THEME_FIELDS.filter(
                    field =>
                      field.group === group &&
                      (group !== "colors" || field.path.startsWith(`colors.${theme.appearance}.`))
                  ).map(field => (
                    <ThemeFieldEditor
                      key={`${custom.id}:${field.path}:${resetRevision[group] ?? 0}`}
                      field={field}
                      theme={custom}
                      value={readThemeField(fieldValues, field.path)}
                      t={t}
                      onChange={next => onChange(updateCustomTheme(value, next))}
                    />
                  ))
                : null}
            </div>
          ))}
        </>
      ) : (
        <text style={{ color: theme.colors.mutedForeground, whiteSpace: "normal" }}>
          {t("themeEditor.readonly")}
        </text>
      )}
      <Separator />
      <Label>{t("themeEditor.json")}</Label>
      <Input
        testId="theme-editor-json"
        aria-label={t("themeEditor.json")}
        value={json}
        invalid={importInvalid}
        onValueChange={next => {
          setJson(next)
          setImportInvalid(false)
          setIncludeWarning(false)
        }}
      />
      <Button
        testId="theme-editor-import"
        onClick={() => {
          const imported = importCustomTheme(json)
          setImportInvalid(imported === null)
          setIncludeWarning(false)
          if (imported) {
            const id: CustomTheme["id"] = `custom:${crypto.randomUUID()}`
            onChange({ selection: id, themes: [...value.themes, { ...imported, id }] })
          }
        }}
      >
        {t("themeEditor.import")}
      </Button>
      <Button testId="theme-editor-import-vscode" onClick={() => importVSCode(json)}>
        {t("themeEditor.importVSCode")}
      </Button>
      {renderer?.promptForPaths ? (
        <Button
          testId="theme-editor-import-vscode-file"
          onClick={() => {
            const prompt = renderer.promptForPaths
            if (!prompt) return
            void prompt.call(renderer, { files: true, prompt: t("themeEditor.importVSCodeFile") })
              .then(paths => {
                if (!paths?.[0]) return
                const text = readTextFile(paths[0])
                setJson(text)
                importVSCode(text)
              })
              .catch(() => {
                setImportInvalid(true)
                setIncludeWarning(false)
              })
          }}
        >
          {t("themeEditor.importVSCodeFile")}
        </Button>
      ) : null}
      {includeWarning ? (
        <text style={{ color: theme.colors.mutedForeground, whiteSpace: "normal" }}>
          {t("themeEditor.includeWarning")}
        </text>
      ) : null}
      {importInvalid ? (
        <text style={{ color: theme.colors.destructive }}>{t("themeEditor.invalidJson")}</text>
      ) : null}
    </div>
  )
}
function ThemeFieldEditor({
  field,
  theme: custom,
  value,
  onChange,
  t,
}: {
  readonly field: ThemeField
  readonly theme: CustomTheme
  readonly value: unknown
  readonly onChange: (theme: CustomTheme) => void
  readonly t: (key: string) => string
}) {
  const theme = useTheme()
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? (typeof value === "string" ? value : "")
  const label = t(field.labelKey)
  const gap = theme.design.settings.itemGap
  return (
    <div style={{ display: "flex", flexDirection: "column", gap, flexShrink: 0 }}>
      <Label>{label}</Label>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap }}>
        {field.kind === "color" ? (
          <>
            <div
              style={{
                width: theme.control["--spacing-control-track"],
                height: theme.control["--spacing-control-track"],
                backgroundColor: typeof value === "string" ? value : theme.colors.background,
                borderWidth: theme.design.shape.controlBorderWidth,
                borderColor: theme.colors.border,
              }}
            />
            <Input
              testId={`theme-field-${field.path}`}
              aria-label={label}
              value={text}
              invalid={!isValidThemeField(field, text)}
              style={{ flexGrow: 1 }}
              onValueChange={next => {
                setDraft(next)
                if (isValidThemeField(field, next))
                  onChange(setThemeField(custom, field.path, next))
              }}
            />
          </>
        ) : (
          <DragPadNumber
            testId={`theme-field-${field.path}`}
            label={label}
            value={typeof value === "number" ? value : field.min}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={next => onChange(setThemeField(custom, field.path, next))}
          />
        )}
        <Button
          testId={`theme-reset-${field.path}`}
          onClick={() => {
            setDraft(null)
            onChange(setThemeField(custom, field.path, undefined))
          }}
        >
          {t("themeEditor.reset")}
        </Button>
      </div>
    </div>
  )
}
