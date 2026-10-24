import { useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import {
  Button,
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  DragPadBipolar,
  DropdownButton,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  PopupButton,
} from "@zoeymind/ui"
import type { DropdownButtonItem } from "@zoeymind/ui"
import { GallerySection, ValueEcho } from "./gallery-section"

type Scale = "C" | "D" | "E" | "F" | "G" | "A" | "B"
type Mode = "major" | "minor" | "dorian"
const scaleNotes: Scale[] = ["C", "D", "E", "F", "G", "A", "B"]
const scales: DropdownButtonItem<Scale>[] = scaleNotes.map(id => ({ id, label: id }))

export function MenuDemos() {
  const { t } = useTranslation()
  const [scale, setScale] = useState<Scale>("C")
  const [mode, setMode] = useState<Mode>("major")
  const [pan, setPan] = useState(0)
  const [gain, setGain] = useState(0)
  const [action, setAction] = useState("none")
  const [snap, setSnap] = useState(true)
  const [clipType, setClipType] = useState("audio")
  const [color, setColor] = useState("warm")
  const modes: DropdownButtonItem<Mode>[] = [
    { id: "major", label: t("library.menus.major") },
    { id: "minor", label: t("library.menus.minor") },
    { id: "dorian", label: t("library.menus.dorian") },
  ]
  return (
    <>
      <GallerySection id="dropdowns">
        <div className="gap-control-gap flex flex-wrap items-center">
          <DropdownButton
            value={scale}
            onChange={setScale}
            label={t("library.menus.scale")}
            description={t("library.menus.rootNote")}
            items={scales}
          />
          <DropdownButton
            value={mode}
            onChange={setMode}
            label={t("library.menus.mode")}
            description={t("library.menus.modeHint")}
            items={modes}
          />
          <DropdownButton<Mode>
            value={mode}
            onChange={setMode}
            label={t("library.menus.grouped")}
            className="max-w-full"
            matchTriggerWidth={false}
            items={[
              { type: "heading", id: "common", label: t("library.menus.common") },
              { id: "major", label: t("library.menus.major"), shortcut: "M" },
              { id: "minor", label: t("library.menus.minor"), shortcut: "N" },
              { type: "separator", id: "separator" },
              { type: "heading", id: "other", label: t("library.menus.other") },
              { id: "dorian", label: t("library.menus.longDorian"), shortcut: "⌘D" },
            ]}
          />
        </div>
        <ValueEcho
          pairs={[
            [t("library.menus.scale"), scale],
            [t("library.menus.mode"), t(`library.menus.${mode}`)],
          ]}
        />
      </GallerySection>
      <GallerySection id="alignment">
        <div className="gap-control-gap flex flex-wrap items-center">
          <DropdownButton
            value={scale}
            onChange={setScale}
            label={t("library.menus.alignRight")}
            align="end"
            matchTriggerWidth={false}
            items={scales}
          />
          <DropdownButton
            value={mode}
            onChange={setMode}
            label={t("library.menus.above")}
            side="top"
            matchTriggerWidth={false}
            items={modes}
          />
          <DropdownButton
            value={scale}
            onChange={setScale}
            label={t("library.menus.rightSide")}
            side="right"
            sideOffset={8}
            matchTriggerWidth={false}
            items={scales}
          />
        </div>
      </GallerySection>
      <GallerySection id="popup">
        <div className="gap-control-gap flex flex-wrap items-center">
          <PopupButton
            label={t("library.menus.mixer")}
            description={t("library.menus.mixerHint")}
            trigger={t("library.menus.mixer")}
            align="start"
            contentClassName="w-56 p-3"
          >
            <div className="gap-control-gap flex flex-col">
              <DragPadBipolar
                value={pan}
                onChange={setPan}
                min={-1}
                max={1}
                step={0.01}
                defaultValue={0}
                label={t("library.controls.pan")}
              />
              <DragPadBipolar
                value={gain}
                onChange={setGain}
                min={-12}
                max={12}
                step={0.1}
                defaultValue={0}
                label={t("library.controls.gain")}
                color="var(--chart-1)"
              />
            </div>
          </PopupButton>
          <PopupButton
            label={t("library.menus.above")}
            trigger={t("library.menus.above")}
            side="top"
            align="end"
            contentClassName="w-48 p-3"
          >
            <DragPadBipolar
              value={gain}
              onChange={setGain}
              min={-12}
              max={12}
              step={0.1}
              defaultValue={0}
              label={t("library.controls.gain")}
            />
          </PopupButton>
        </div>
        <ValueEcho
          pairs={[
            [t("library.controls.pan"), pan.toFixed(2)],
            [t("library.controls.gain"), `${gain.toFixed(1)} dB`],
          ]}
        />
      </GallerySection>
      <GallerySection id="popover">
        <div className="gap-control-gap flex flex-wrap items-center">
          <Popover>
            <PopoverTrigger
              nativeButton
              render={
                <Button size="control" variant="secondary">
                  {t("library.menus.popover")}
                </Button>
              }
            />
            <PopoverContent align="start" className="w-64">
              <PopoverHeader>
                <PopoverTitle>{t("library.menus.popoverTitle")}</PopoverTitle>
                <PopoverDescription>{t("library.menus.popoverHint")}</PopoverDescription>
              </PopoverHeader>
              <Button size="control" onClick={() => setAction("inspected")}>
                {t("library.menus.inspect")}
              </Button>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger
              nativeButton
              render={
                <Button size="control" variant="outline">
                  {t("library.menus.above")}
                </Button>
              }
            />
            <PopoverContent side="top" align="end" className="w-64">
              <PopoverHeader>
                <PopoverTitle>{t("library.menus.popoverTitle")}</PopoverTitle>
                <PopoverDescription>{t("library.menus.popoverHint")}</PopoverDescription>
              </PopoverHeader>
              <Button size="control" onClick={() => setAction("inspected")}>
                {t("library.menus.inspect")}
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </GallerySection>
      <GallerySection id="context">
        <ContextMenu>
          <ContextMenuTrigger
            tabIndex={0}
            style={{ color: color === "warm" ? "var(--chart-1)" : "var(--chart-2)" }}
            onKeyDown={event => {
              if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return
              event.preventDefault()
              event.stopPropagation()
              const bounds = event.currentTarget.getBoundingClientRect()
              event.currentTarget.dispatchEvent(
                new MouseEvent("contextmenu", {
                  bubbles: true,
                  cancelable: true,
                  clientX: bounds.left + bounds.width / 2,
                  clientY: bounds.top + bounds.height / 2,
                })
              )
            }}
            className="bg-muted focus-visible:outline-ring flex min-h-20 items-center justify-center rounded-sm px-3 text-center text-xs focus-visible:outline-2"
          >
            {t("library.menus.contextTarget")}
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuLabel>{t("library.menus.clipActions")}</ContextMenuLabel>
            <ContextMenuItem onClick={() => setAction("duplicated")}>
              {t("library.menus.duplicate")}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setAction("renamed")}>
              {t("library.menus.rename")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem disabled>{t("library.menus.deleteUnavailable")}</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuCheckboxItem checked={snap} onCheckedChange={setSnap}>
              {t("library.menuOptions.snap")}
            </ContextMenuCheckboxItem>
            <ContextMenuLabel>{t("library.menuOptions.clipType")}</ContextMenuLabel>
            <ContextMenuRadioGroup value={clipType} onValueChange={setClipType}>
              <ContextMenuRadioItem value="audio">
                {t("library.menuOptions.audio")}
              </ContextMenuRadioItem>
              <ContextMenuRadioItem value="midi">
                {t("library.menuOptions.midi")}
              </ContextMenuRadioItem>
            </ContextMenuRadioGroup>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger>{t("library.menuOptions.color")}</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem onClick={() => setColor("warm")}>
                  {t("library.menuOptions.warm")}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => setColor("cool")}>
                  {t("library.menuOptions.cool")}
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuContent>
        </ContextMenu>
        <p role="status" className="text-muted-foreground text-[11px]">
          {t(`library.menus.actions.${action}`)}
        </p>
        <ValueEcho
          pairs={[
            [t("library.menuOptions.snap"), t(snap ? "library.state.on" : "library.state.off")],
            [t("library.menuOptions.clipType"), t(`library.menuOptions.${clipType}`)],
            [t("library.menuOptions.color"), t(`library.menuOptions.${color}`)],
          ]}
        />
      </GallerySection>
    </>
  )
}
