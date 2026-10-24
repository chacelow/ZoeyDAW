import { useId, useState } from "react"
import { Check, Plus, Settings, Volume2 } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import {
  Button,
  Input,
  Label,
  MotionTabs,
  RadioGroup,
  RadioGroupItem,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
} from "@zoeymind/ui"
import { useSettingsDialog } from "@/shared/app-shared/settings-dialog-store"
import { GallerySection, ValueEcho } from "./gallery-section"
import { ButtonVariants } from "./button-variants"

export function FormDemos() {
  const { t } = useTranslation()
  const id = useId()
  const [name, setName] = useState("")
  const [radio, setRadio] = useState("stereo")
  const [tool, setTool] = useState("draw")
  const [monitor, setMonitor] = useState(true)
  const [clicks, setClicks] = useState(0)
  const openSettings = useSettingsDialog(state => state.openSettings)
  const valid = name.trim().length >= 3
  return (
    <>
      <GallerySection id="buttons">
        <div className="gap-control-gap flex flex-wrap items-center">
          {(
            ["default", "outline", "ghost", "secondary", "destructive", "link"] satisfies Array<
              "default" | "outline" | "ghost" | "secondary" | "destructive" | "link"
            >
          ).map(variant => (
            <Button
              key={variant}
              variant={variant}
              size="control"
              onClick={() => setClicks(value => value + 1)}
            >
              {t(`library.buttons.${variant}`)}
            </Button>
          ))}
          <Button size="control" disabled>
            {t("library.state.disabled")}
          </Button>
          <Button
            size="control-icon"
            aria-label={t("library.actions.add")}
            onClick={() => setClicks(value => value + 1)}
          >
            <Plus />
          </Button>
          <Button
            size="control-icon"
            variant="secondary"
            disabled
            aria-label={t("library.actions.unavailable")}
          >
            <Plus />
          </Button>
        </div>
        <ValueEcho pairs={[[t("library.buttons.activations"), String(clicks)]]} />
        <ButtonVariants />
      </GallerySection>
      <GallerySection id="inputs">
        <div className="gap-control-gap grid sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${id}-name`} className="text-xs">
              {t("library.inputs.editable")}
            </Label>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder={t("library.inputs.placeholder")}
              aria-invalid={name.length > 0 && !valid}
              aria-describedby={`${id}-help`}
              className="h-control-h rounded-sm text-xs"
            />
            <p
              id={`${id}-help`}
              className={`text-[11px] ${name.length > 0 && !valid ? "text-destructive" : "text-muted-foreground"}`}
            >
              {t(valid ? "library.inputs.valid" : "library.inputs.help")}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-invalid`} className="text-xs">
              {t("library.inputs.invalid")}
            </Label>
            <Input
              id={`${id}-invalid`}
              defaultValue={t("library.inputs.invalidValue")}
              aria-invalid
              aria-describedby={`${id}-error`}
              className="h-control-h rounded-sm text-xs"
            />
            <p id={`${id}-error`} className="text-destructive text-[11px]">
              {t("library.inputs.error")}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-valid`} className="text-xs">
              {t("library.inputs.validLabel")}
            </Label>
            <Input
              id={`${id}-valid`}
              defaultValue={t("library.inputs.validValue")}
              aria-invalid={false}
              className="h-control-h rounded-sm text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-disabled`} className="text-xs">
              {t("library.state.disabled")}
            </Label>
            <Input
              id={`${id}-disabled`}
              disabled
              value={t("library.inputs.disabledValue")}
              className="h-control-h rounded-sm text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-readonly`} className="text-xs">
              {t("library.catalog.states.readonly")}
            </Label>
            <Input
              id={`${id}-readonly`}
              readOnly
              value={t("library.inputs.validValue")}
              className="h-control-h rounded-sm text-xs"
            />
          </div>
        </div>
      </GallerySection>
      <GallerySection id="radio">
        <RadioGroup
          value={radio}
          onValueChange={setRadio}
          aria-label={t("library.forms.channels")}
          className="flex flex-wrap items-center gap-3"
        >
          {["stereo", "mono", "unavailable"].map(value => (
            <Label key={value} htmlFor={`${id}-${value}`} className="gap-control-gap text-xs">
              <RadioGroupItem
                id={`${id}-${value}`}
                value={value}
                disabled={value === "unavailable"}
              />
              {t(`library.forms.${value}`)}
            </Label>
          ))}
        </RadioGroup>
        <ValueEcho pairs={[[t("library.forms.channels"), t(`library.forms.${radio}`)]]} />
      </GallerySection>
      <GallerySection id="toggle-group">
        <div className="gap-control-gap flex flex-wrap items-center">
          <ToggleGroup
            type="single"
            value={tool}
            onValueChange={setTool}
            aria-label={t("library.forms.tools")}
          >
            <ToggleGroupItem
              value="draw"
              className="h-control-h px-control-pad-x rounded-sm text-xs"
            >
              {t("library.forms.draw")}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="snap"
              className="h-control-h px-control-pad-x rounded-sm text-xs"
            >
              {t("library.forms.snap")}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="off"
              disabled
              className="h-control-h px-control-pad-x rounded-sm text-xs"
            >
              {t("library.state.disabled")}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <ValueEcho
          pairs={[
            [t("library.forms.tools"), tool ? t(`library.forms.${tool}`) : t("library.state.none")],
          ]}
        />
      </GallerySection>
      <GallerySection id="toggle">
        <div className="gap-control-gap flex flex-wrap items-center">
          <Toggle
            pressed={monitor}
            onPressedChange={setMonitor}
            aria-label={t("library.forms.monitor")}
            className="size-control-h rounded-sm p-0"
          >
            <Volume2 className="size-control-icon" />
          </Toggle>
          <Toggle
            disabled
            aria-label={t("library.actions.unavailable")}
            className="size-control-h rounded-sm p-0"
          >
            <Check className="size-control-icon" />
          </Toggle>
        </div>
        <ValueEcho
          pairs={[
            [t("library.forms.monitor"), t(monitor ? "library.state.on" : "library.state.off")],
          ]}
        />
      </GallerySection>
      <GallerySection id="tabs">
        <MotionTabs
          containerClassName="bg-muted rounded-sm p-1"
          tabClassName="h-control-h px-control-pad-x text-xs"
          indicatorClassName="bg-accent my-1 rounded-sm shadow-none"
          hoverIndicatorClassName="bg-accent/50 my-1 rounded-sm"
          options={[
            {
              key: "clips",
              label: t("library.forms.clips"),
              content: (
                <p className="text-muted-foreground text-xs">{t("library.forms.clipContent")}</p>
              ),
            },
            {
              key: "devices",
              label: t("library.forms.devices"),
              content: (
                <p className="text-muted-foreground text-xs">{t("library.forms.deviceContent")}</p>
              ),
            },
            {
              key: "routing",
              label: t("library.forms.routing"),
              content: (
                <p className="text-muted-foreground text-xs">{t("library.forms.routingContent")}</p>
              ),
            },
          ]}
        />
        <div>
          <Button size="control" variant="secondary" onClick={() => openSettings()}>
            <Settings />
            {t("library.actions.settings")}
          </Button>
        </div>
      </GallerySection>
    </>
  )
}
