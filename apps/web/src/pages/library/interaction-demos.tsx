import { useRef, useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import {
  Button,
  DragPadBar,
  DragPadNumber,
  DragPadToggle,
  ScrollArea,
  rowInteractiveClasses,
} from "@zoeymind/ui"
import { useControlInteractions } from "@/shared/control-interactions/index"
import { GallerySection } from "./gallery-section"

export function MappingModeToggle() {
  const { t } = useTranslation()
  const active = useControlInteractions(state => state.mappingActive)
  const toggle = useControlInteractions(state => state.toggleMapping)
  return (
    <DragPadToggle
      value={active}
      onChange={toggle}
      label={t("library.mapping.label")}
      labelOn={t("library.mapping.on")}
      labelOff={t("library.mapping.off")}
      mappable={false}
      size="compact"
    />
  )
}

export function InteractionDemos() {
  const { t } = useTranslation()
  const [value, setValue] = useState(0.5)
  const [enabled, setEnabled] = useState(false)
  return (
    <>
      <GallerySection id="mapping">
        <MappingModeToggle />
        <div className="gap-control-gap flex flex-wrap items-center">
          <DragPadNumber
            label={t("library.controls.gain")}
            value={value}
            onChange={setValue}
            min={0}
            max={1}
            step={0.01}
          />
          <DragPadBar
            label={t("library.controls.send")}
            value={value}
            onChange={setValue}
            min={0}
            max={1}
            step={0.01}
          />
          <DragPadToggle
            label={t("library.controls.link")}
            value={enabled}
            onChange={setEnabled}
            labelOn={t("library.state.on")}
            labelOff={t("library.state.off")}
          />
        </div>
      </GallerySection>
      <GallerySection id="warnings">
        <WarningDemo />
      </GallerySection>
      <GallerySection id="list">
        <ListDemo />
      </GallerySection>
    </>
  )
}

function WarningDemo() {
  const { t } = useTranslation()
  const info = useControlInteractions(state => state.info)
  const warnings = useControlInteractions(state => state.warnings)
  const pushWarning = useControlInteractions(state => state.pushWarning)
  const dismissWarning = useControlInteractions(state => state.dismissWarning)
  const clearWarnings = useControlInteractions(state => state.clearWarnings)
  return (
    <div className="gap-control-gap flex flex-col">
      <div className="gap-control-gap flex flex-wrap items-center">
        <Button
          size="control"
          variant="secondary"
          onClick={() =>
            pushWarning({
              id: "no-audio",
              message: t("library.warnings.noAudio"),
              severity: "warning",
            })
          }
        >
          {t("library.warnings.pushWarning")}
        </Button>
        <Button
          size="control"
          variant="secondary"
          onClick={() =>
            pushWarning({
              id: "sample-missing",
              message: t("library.warnings.missingSample"),
              severity: "error",
            })
          }
        >
          {t("library.warnings.pushError")}
        </Button>
        <Button
          size="control"
          variant="secondary"
          onClick={() =>
            pushWarning({ id: "autosave", message: t("library.warnings.saved"), severity: "info" })
          }
        >
          {t("library.warnings.pushInfo")}
        </Button>
        <Button
          size="control"
          variant="ghost"
          disabled={warnings.length === 0}
          onClick={clearWarnings}
        >
          {t("library.warnings.clear")}
        </Button>
      </div>
      <p role="status" className="text-muted-foreground min-h-4 text-[11px]">
        {info ? (
          <>
            {t("library.warnings.controlInfo", { info: t(`project.info.${info}.title`) })} ·{" "}
            {t(`project.info.${info}.description`)}
          </>
        ) : (
          t("library.warnings.latest", {
            message: warnings.at(-1)?.message ?? t("library.state.none"),
          })
        )}{" "}
        · {t("library.warnings.count", { count: warnings.length })}
      </p>
      <div className="gap-control-gap flex flex-wrap">
        {warnings.map(warning => (
          <Button
            key={warning.id}
            size="control"
            variant="secondary"
            onClick={() => dismissWarning(warning.id)}
            aria-label={t("library.warnings.dismiss", { message: warning.message })}
          >
            × {warning.message}
          </Button>
        ))}
      </div>
    </div>
  )
}

const listItems = [
  { id: "kick", label: "kick", disabled: false },
  { id: "snare", label: "snare", disabled: false },
  { id: "hat", label: "hat", disabled: false },
  { id: "clap", label: "clap", disabled: false },
  { id: "unavailable", label: "unavailable", disabled: true },
  ...Array.from({ length: 10 }, (_, index) => ({
    id: `sample-${index + 1}`,
    label: "sample",
    disabled: false,
  })),
]

function ListDemo() {
  const { t } = useTranslation()
  const [selected, setSelected] = useState("snare")
  const rows = useRef(new Map<string, HTMLButtonElement>())
  const available = listItems.filter(item => !item.disabled)
  function move(id: string, key: string) {
    const index = available.findIndex(item => item.id === id)
    const nextIndex =
      key === "Home"
        ? 0
        : key === "End"
          ? available.length - 1
          : (index + (key === "ArrowDown" ? 1 : -1) + available.length) % available.length
    const next = available[nextIndex]
    if (!next) return
    setSelected(next.id)
    const element = rows.current.get(next.id)
    element?.focus({ preventScroll: true })
    element?.scrollIntoView({ block: "nearest" })
  }
  return (
    <>
      <ScrollArea className="bg-muted h-48 rounded-sm">
        <div
          role="listbox"
          aria-label={t("library.list.label")}
          className="flex flex-col gap-0.5 p-1"
        >
          {listItems.map(item => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={selected === item.id}
              disabled={item.disabled}
              tabIndex={selected === item.id ? 0 : -1}
              ref={element => {
                if (element) rows.current.set(item.id, element)
                else rows.current.delete(item.id)
              }}
              onClick={() => setSelected(item.id)}
              onKeyDown={event => {
                if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return
                event.preventDefault()
                event.stopPropagation()
                move(item.id, event.key)
              }}
              className={rowInteractiveClasses({
                active: selected === item.id,
                disabled: item.disabled,
              })}
            >
              <span className="truncate">
                {t(`library.list.${item.label}`, { number: item.id.replace("sample-", "") })}
              </span>
            </button>
          ))}
        </div>
      </ScrollArea>
      <p className="text-muted-foreground text-[11px]">{t("library.list.keyboard")}</p>
    </>
  )
}
