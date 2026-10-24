import { useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  PanControl,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Separator,
  VolumeFader,
} from "@zoeymind/ui"
import { ValueEcho } from "./gallery-section"

export function PanDemos() {
  const { t } = useTranslation()
  const [center, setCenter] = useState(0)
  const [left, setLeft] = useState(-0.5)
  const [right, setRight] = useState(0.5)
  return (
    <div className="gap-control-gap flex flex-col">
      <div className="gap-control-gap flex flex-wrap items-center">
        <PanControl
          value={center}
          onChange={setCenter}
          label={t("library.catalog.demo.panCenter")}
        />
        <PanControl
          value={left}
          onChange={setLeft}
          label={t("library.catalog.demo.panLeft")}
          size="compact"
        />
        <PanControl value={right} onChange={setRight} label={t("library.catalog.demo.panRight")} />
        <PanControl value={0} onChange={setCenter} label={t("library.state.disabled")} disabled />
      </div>
      <ValueEcho
        pairs={[
          [t("library.catalog.demo.panCenter"), center.toFixed(2)],
          [t("library.catalog.demo.panLeft"), left.toFixed(2)],
          [t("library.catalog.demo.panRight"), right.toFixed(2)],
        ]}
      />
    </div>
  )
}

export function FaderDemos() {
  const { t } = useTranslation()
  const [horizontal, setHorizontal] = useState(-12)
  const [vertical, setVertical] = useState(0)
  return (
    <div className="gap-control-gap flex flex-col">
      <div className="flex flex-wrap items-end gap-6">
        <div className="w-64 space-y-3">
          <p className="text-xs">{t("library.catalog.demo.horizontal")}</p>
          <VolumeFader
            aria-label={t("library.catalog.demo.horizontal")}
            orientation="horizontal"
            valueDb={horizontal}
            onChange={setHorizontal}
            className="h-7 w-full"
          />
          <VolumeFader
            aria-label={t("library.state.disabled")}
            orientation="horizontal"
            valueDb={-18}
            onChange={setHorizontal}
            disabled
            className="h-7 w-full"
          />
        </div>
        <div className="space-y-3">
          <p className="text-xs">{t("library.catalog.demo.vertical")}</p>
          <VolumeFader
            aria-label={t("library.catalog.demo.vertical")}
            orientation="vertical"
            valueDb={vertical}
            onChange={setVertical}
            className="h-52 w-9"
          />
        </div>
      </div>
      <ValueEcho
        pairs={[
          [t("library.catalog.demo.horizontal"), `${horizontal.toFixed(1)} dB`],
          [t("library.catalog.demo.vertical"), `${vertical.toFixed(1)} dB`],
        ]}
      />
      <Button
        variant="secondary"
        size="control"
        className="self-start"
        onClick={() => {
          setHorizontal(0)
          setVertical(0)
        }}
      >
        {t("library.actions.reset")}
      </Button>
    </div>
  )
}

export function CommandDemos() {
  const { t } = useTranslation()
  const [action, setAction] = useState<string | null>(null)
  return (
    <div className="space-y-3">
      <Command
        className="border-border/60 max-w-xl rounded-sm! border"
        label={t("library.catalog.demo.commandLabel")}
      >
        <CommandInput placeholder={t("library.catalog.demo.commandSearch")} />
        <CommandList>
          <CommandEmpty>{t("library.catalog.demo.commandEmpty")}</CommandEmpty>
          <CommandGroup heading={t("library.catalog.demo.commandGroup")}>
            {["play", "stop", "reset"].map(value => (
              <CommandItem
                key={value}
                value={t(`library.catalog.demo.command-${value}`)}
                onSelect={() => setAction(value)}
              >
                {t(`library.catalog.demo.command-${value}`)}
              </CommandItem>
            ))}
            <CommandItem disabled>{t("library.actions.unavailable")}</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
      <p role="status" className="text-muted-foreground text-[11px]">
        {action ? t(`library.catalog.demo.command-${action}`) : t("library.state.none")}
      </p>
    </div>
  )
}

export function LayoutDemos() {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <ResizablePanelGroup
        orientation="horizontal"
        className="border-border/60 h-64! rounded-sm border"
      >
        <ResizablePanel defaultSize="35%" minSize="15%">
          <div className="bg-muted/30 flex h-full items-center justify-center p-3 text-xs">
            {t("library.catalog.demo.layoutBrowser")}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle aria-label={t("library.catalog.demo.layoutResize")} />
        <ResizablePanel minSize="25%">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize="65%" minSize="20%">
              <div className="flex h-full items-center justify-center p-3 text-xs">
                {t("library.catalog.demo.layoutArrangement")}
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle aria-label={t("library.catalog.demo.layoutResize")} />
            <ResizablePanel minSize="20%">
              <div className="bg-muted/30 flex h-full items-center justify-center p-3 text-xs">
                {t("library.catalog.demo.layoutDetail")}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
      <div className="gap-control-gap h-control-h flex items-center text-xs">
        <span>{t("library.catalog.demo.layoutBrowser")}</span>
        <Separator orientation="vertical" />
        <span>{t("library.catalog.demo.layoutArrangement")}</span>
      </div>
      <Separator />
    </div>
  )
}
