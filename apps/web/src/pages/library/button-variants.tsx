import { useState } from "react"
import { Circle, Play, Volume2 } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { Button, controlInteractiveClasses } from "@zoeymind/ui"

export function ButtonVariants() {
  const { t } = useTranslation()
  const [active, setActive] = useState(false)
  const [highlight, setHighlight] = useState(true)
  return (
    <div className="gap-control-gap flex flex-col">
      <p className="text-muted-foreground text-[11px]">
        {t("library.catalog.variantsList.buttonSizes")}
      </p>
      <div className="gap-control-gap flex flex-wrap items-center">
        {(
          ["default", "xs", "sm", "lg", "control"] satisfies Array<
            "default" | "xs" | "sm" | "lg" | "control"
          >
        ).map(size => (
          <Button
            key={size}
            size={size}
            variant="secondary"
            onClick={() => setActive(value => !value)}
          >
            {t(`library.catalog.demo.size-${size}`)}
          </Button>
        ))}
        <Button
          variant="secondary"
          size="transport-icon"
          aria-label={t("library.toolbars.play")}
          onClick={() => setActive(value => !value)}
        >
          <Play />
        </Button>
      </div>
      <p className="text-muted-foreground text-[11px]">
        {t("library.catalog.variantsList.buttonColors")}
      </p>
      <div className="gap-control-gap flex flex-wrap items-center">
        <Button
          size="control"
          variant="secondary"
          aria-pressed={active}
          className={controlInteractiveClasses({ active, highlight })}
          onClick={() => setActive(value => !value)}
        >
          <Volume2 />
          {t("library.catalog.demo.activeButton")}
        </Button>
        <Button
          size="control"
          variant="secondary"
          aria-pressed={highlight}
          onClick={() => setHighlight(value => !value)}
        >
          {t(highlight ? "library.catalog.demo.highlightOn" : "library.catalog.demo.highlightOff")}
        </Button>
        <Button size="control" variant="destructive" onClick={() => setActive(value => !value)}>
          <Circle />
          {t("library.toolbars.record")}
        </Button>
        <Button size="control-icon" disabled aria-label={t("library.actions.unavailable")}>
          <Volume2 />
        </Button>
      </div>
    </div>
  )
}
