import { useEffect, useRef, useState } from "react"
import { Check, FileAudio, GripVertical, RotateCcw } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import {
  Button,
  DragPreviewArea,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  LoadErrorScreen,
  Loading,
  Progress,
} from "@zoeymind/ui"
import { dismissToast, toast } from "@/shared/app-shared"
import { GallerySection } from "./gallery-section"

export function FeedbackDemos() {
  const { t } = useTranslation()
  const [progress, setProgress] = useState(35)
  const [resource, setResource] = useState<"error" | "loading" | "ready">("error")
  const [toastId, setToastId] = useState<string | null>(null)
  const ownedToasts = useRef(new Set<string>())
  useEffect(() => {
    if (resource !== "loading") return
    const timer = window.setTimeout(() => setResource("ready"), 900)
    return () => window.clearTimeout(timer)
  }, [resource])
  useEffect(
    () => () => {
      for (const id of ownedToasts.current) dismissToast(id)
    },
    []
  )
  return (
    <>
      <GallerySection id="progress">
        <Progress
          value={progress}
          aria-label={t("library.feedback.progress")}
          aria-valuetext={`${progress}%`}
          className="h-1.5"
        />
        <div className="gap-control-gap flex flex-wrap items-center">
          <span className="text-muted-foreground min-w-9 text-[11px] tabular-nums">
            {progress}%
          </span>
          <Button
            size="control"
            variant="secondary"
            disabled={progress === 100}
            onClick={() => setProgress(value => Math.min(100, value + 10))}
          >
            {t("library.feedback.advance")}
          </Button>
          <Button
            size="control-icon"
            variant="ghost"
            aria-label={t("library.actions.reset")}
            onClick={() => setProgress(0)}
          >
            <RotateCcw />
          </Button>
        </div>
      </GallerySection>
      <GallerySection id="resourceStates">
        <div
          aria-live="polite"
          className="bg-muted/30 relative min-h-56 overflow-hidden rounded-sm"
        >
          {resource === "error" ? (
            <LoadErrorScreen
              title={t("library.feedback.errorTitle")}
              description={t("library.feedback.errorHint")}
              primaryLabel={t("library.actions.retry")}
              onPrimary={() => setResource("loading")}
              className="absolute! inset-0! z-0! [&_h2]:mb-1 [&_h2]:text-sm [&_img]:hidden [&_p]:mb-3 [&_p]:text-xs [&>div:last-child]:px-3 [&>div:last-child>div]:mb-2"
            />
          ) : null}
          {resource === "loading" ? (
            <Loading show tip={t("library.feedback.loading")} className="absolute! inset-0! z-0!" />
          ) : null}
          {resource === "ready" ? (
            <Empty>
              <EmptyHeader>
                <Check className="text-primary size-control-icon" />
                <EmptyTitle>{t("library.feedback.ready")}</EmptyTitle>
                <EmptyDescription>{t("library.feedback.readyHint")}</EmptyDescription>
              </EmptyHeader>
              <Button size="control" variant="secondary" onClick={() => setResource("error")}>
                {t("library.feedback.showError")}
              </Button>
            </Empty>
          ) : null}
        </div>
        <Empty className="p-3">
          <EmptyHeader>
            <EmptyTitle>{t("library.feedback.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("library.feedback.emptyHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </GallerySection>
      <GallerySection id="toast">
        <div className="gap-control-gap flex flex-wrap items-center">
          <Button
            size="control"
            variant="secondary"
            onClick={() => ownedToasts.current.add(toast.success(t("library.feedback.success")))}
          >
            {t("library.feedback.successLabel")}
          </Button>
          <Button
            size="control"
            variant="secondary"
            onClick={() => {
              const id = toast.loading(t("library.feedback.loading"), "gallery-loading")
              ownedToasts.current.add(id)
              setToastId(id)
            }}
          >
            {t("library.feedback.loadingLabel")}
          </Button>
          <Button
            size="control"
            variant="secondary"
            disabled={!toastId}
            onClick={() => {
              if (!toastId) return
              toast.success(t("library.feedback.success"), { id: toastId })
              setToastId(null)
            }}
          >
            {t("library.feedback.finish")}
          </Button>
          <Button
            size="control"
            variant="secondary"
            onClick={() => ownedToasts.current.add(toast.error(t("library.feedback.errorTitle")))}
          >
            {t("library.feedback.errorLabel")}
          </Button>
        </div>
      </GallerySection>
      <GallerySection id="dragPreview">
        <DragPreviewDemo />
      </GallerySection>
    </>
  )
}

function DragPreviewDemo() {
  const { t } = useTranslation()
  const [status, setStatus] = useState("idle")
  const source = useRef<HTMLDivElement>(null)
  const active = useRef(false)
  useEffect(() => {
    const element = source.current
    if (!element) return
    const observer = new MutationObserver(() => {
      if (element.hasAttribute("data-drag-preview-source-active")) {
        active.current = true
        setStatus("dragging")
      }
    })
    observer.observe(element, {
      attributes: true,
      attributeFilter: ["data-drag-preview-source-active"],
    })
    function finish(event: Event) {
      if (!active.current) return
      if (event instanceof KeyboardEvent && event.key !== "Escape") return
      active.current = false
      setStatus(event.type === "pointerup" ? "released" : "cancelled")
    }
    window.addEventListener("pointerup", finish, true)
    window.addEventListener("pointercancel", finish, true)
    window.addEventListener("keydown", finish, true)
    window.addEventListener("blur", finish)
    return () => {
      observer.disconnect()
      window.removeEventListener("pointerup", finish, true)
      window.removeEventListener("pointercancel", finish, true)
      window.removeEventListener("keydown", finish, true)
      window.removeEventListener("blur", finish)
    }
  }, [])
  return (
    <>
      <DragPreviewArea
        disabledDropLabel={t("library.drag.unavailable")}
        renderPreview={() => (
          <>
            <FileAudio className="size-control-icon" />
            {t("library.drag.sample")}
          </>
        )}
      >
        <div
          ref={source}
          data-drag-source
          className="bg-muted gap-control-gap flex cursor-grab items-center rounded-sm p-3 text-xs active:cursor-grabbing"
        >
          <GripVertical className="text-muted-foreground size-control-icon" />
          <FileAudio className="size-control-icon" />
          <span>{t("library.drag.sample")}</span>
        </div>
      </DragPreviewArea>
      <p role="status" className="text-muted-foreground text-[11px]">
        {t(`library.drag.${status}`)}
      </p>
    </>
  )
}
