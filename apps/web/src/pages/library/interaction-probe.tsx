import { useRef, useState } from "react"
import type { ReactNode } from "react"
import { useTranslation } from "@zoeymind/i18n"

type ObservedEvent =
  "idle" | "enter" | "leave" | "focus" | "blur" | "down" | "up" | "cancel" | "input" | "wheel"
export function InteractionProbe({ children }: { readonly children: ReactNode }) {
  const { t } = useTranslation()
  const enteredAt = useRef<number | null>(null)
  const [observation, setObservation] = useState<{
    readonly event: ObservedEvent
    readonly duration: number | null
  }>({ event: "idle", duration: null })
  return (
    <div>
      <div
        onPointerEnter={() => {
          enteredAt.current = performance.now()
          setObservation({ event: "enter", duration: null })
        }}
        onPointerLeave={() => {
          setObservation({
            event: "leave",
            duration:
              enteredAt.current === null ? null : Math.round(performance.now() - enteredAt.current),
          })
          enteredAt.current = null
        }}
        onFocusCapture={() => setObservation({ event: "focus", duration: null })}
        onBlurCapture={() => setObservation({ event: "blur", duration: null })}
        onPointerDownCapture={() => setObservation({ event: "down", duration: null })}
        onPointerUpCapture={() => setObservation({ event: "up", duration: null })}
        onPointerCancelCapture={() => setObservation({ event: "cancel", duration: null })}
        onInputCapture={() => setObservation({ event: "input", duration: null })}
        onWheelCapture={() => setObservation({ event: "wheel", duration: null })}
      >
        {children}
      </div>
      {observation.event !== "idle" && (
        <output
          className="text-muted-foreground mt-2 inline-block text-[10px]"
          title={t("library.catalog.probe.hint")}
          data-gallery-observed-event={observation.event}
        >
          {t(`library.catalog.probe.${observation.event}`)}
          {observation.duration === null ? "" : ` · ${observation.duration} ms`}
        </output>
      )}
    </div>
  )
}
