import { useSyncExternalStore } from "react"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"
import { Button } from "../Button"
import type { Props } from "@gpuix/react"

export type ToastVariant = "default" | "destructive" | "warning" | "success" | "info"
export type ToastPosition =
  "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right"
export interface ToastAction {
  readonly label: string
  readonly onClick: () => void
}
export interface ToastOptions {
  readonly id?: string
  readonly variant?: ToastVariant
  readonly title?: string
  readonly description?: string
  readonly message?: string
  readonly duration?: number
  readonly action?: ToastAction
}
export interface ToastPolicy {
  readonly defaultDuration: number
  readonly queueLimit: number
  readonly visibleLimit: number
}

interface Notice extends ToastOptions {
  readonly id: string
  readonly status: ToastVariant | "loading"
}

type ToastInput = ToastOptions | string | number
type ToastMethodOptions = Omit<ToastOptions, "description" | "message" | "variant">
const emptySnapshot: readonly Notice[] = []
const store: { snapshot: readonly Notice[]; idSeed: number; policy: ToastPolicy | null } = {
  snapshot: emptySnapshot,
  idSeed: 0,
  policy: null,
}
const subscribers = new Set<() => void>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

/** The composition root owns the preference; pending notices retain their existing expiry. */
export function configureToastPolicy(next: ToastPolicy) {
  store.policy = next
  const evicted = store.snapshot.slice(0, Math.max(0, store.snapshot.length - next.queueLimit))
  for (const notice of evicted) clearTimer(notice.id)
  if (evicted.length > 0) {
    store.snapshot = store.snapshot.slice(-next.queueLimit)
    publish()
  }
}

function subscribe(listener: () => void) {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}
function getSnapshot() {
  return store.snapshot
}
function publish() {
  for (const listener of subscribers) listener()
}
function clearTimer(id: string) {
  clearTimeout(timers.get(id))
  timers.delete(id)
}

export function dismissToast(id?: string | number) {
  if (id === undefined) {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    store.snapshot = emptySnapshot
  } else {
    const key = String(id)
    clearTimer(key)
    store.snapshot = store.snapshot.filter(notice => notice.id !== key)
  }
  publish()
}

function upsert(options: ToastOptions, status: Notice["status"] = options.variant ?? "default") {
  const policy = store.policy
  // A configured policy is an application-composition invariant, not user-facing fallback text.
  if (!policy) throw new Error("Configure toast policy before publishing notifications")
  const id = options.id ?? `toast-${++store.idSeed}`
  const previous = store.snapshot.find(notice => notice.id === id)
  const notice: Notice = { ...options, id, status }
  clearTimer(id)
  const updated = previous
    ? store.snapshot.map(item => (item.id === id ? notice : item))
    : [...store.snapshot, notice]
  const evicted = updated.slice(0, Math.max(0, updated.length - policy.queueLimit))
  for (const item of evicted) clearTimer(item.id)
  store.snapshot = updated.slice(-policy.queueLimit)
  const duration = notice.duration ?? policy.defaultDuration
  if (Number.isFinite(duration) && duration > 0) {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), duration)
    )
  }
  publish()
  return id
}

function notify(input: ToastInput, options?: Omit<ToastOptions, "message">) {
  return upsert(typeof input === "object" ? input : { ...options, description: String(input) })
}
function variantMethod(variant: ToastVariant) {
  return (message: string | number, options?: ToastMethodOptions) =>
    upsert({ ...options, description: String(message), variant })
}

export function toastLoading(message: string, id?: string) {
  // Zero denotes a persistent notification until replacement or dismissal, not a duration default.
  return upsert({ id, description: message, duration: 0 }, "loading")
}

export const toast = Object.assign(notify, {
  success: variantMethod("success"),
  error: variantMethod("destructive"),
  info: variantMethod("info"),
  warning: variantMethod("warning"),
  loading: (message: string, id?: string) => toastLoading(message, id),
  dismiss: dismissToast,
})

export interface ToasterProps extends Props {
  readonly position?: ToastPosition
  readonly dismissLabel: string
  readonly loadingLabel: string
  readonly "aria-label": string
  readonly policy: ToastPolicy
}

export function Toaster({
  position = "bottom-right",
  dismissLabel,
  loadingLabel,
  policy: presentation,
  style,
  testId = "toaster",
  ...props
}: ToasterProps) {
  const theme = useTheme()
  const metrics = theme.design.toast
  const notices = useSyncExternalStore(subscribe, getSnapshot, () => emptySnapshot)
  const gap = theme.control["--spacing-control-track-gap"]
  const top = position.startsWith("top")
  const left = position.endsWith("left")
  const center = position.endsWith("center")
  return (
    <div
      {...props}
      testId={testId}
      role="region"
      aria-label={props["aria-label"]}
      style={sx(
        {
          position: "absolute",
          top: top ? metrics.edgeInset : undefined,
          bottom: top ? undefined : metrics.edgeInset,
          left: left || center ? metrics.edgeInset : undefined,
          right: left ? undefined : metrics.edgeInset,
          display: "flex",
          flexDirection: "column",
          alignItems: center ? "center" : "stretch",
          gap: metrics.stackGap,
          width: center ? undefined : metrics.width,
          pointerEvents: "none",
        },
        style
      )}
    >
      {notices.slice(-presentation.visibleLimit).map(notice => (
        <div
          key={notice.id}
          testId={`${testId}-${notice.id}`}
          role={notice.status === "destructive" ? "alert" : "status"}
          aria-label={notice.title ?? notice.description ?? notice.message}
          aria-description={notice.title ? (notice.description ?? notice.message) : undefined}
          aria-busy={notice.status === "loading"}
          style={{
            display: "flex",
            flexDirection: "column",
            gap,
            padding: metrics.inset,
            width: metrics.width,
            borderWidth: theme.design.shape.cardBorderWidth,
            borderRadius: metrics.radius,
            borderColor:
              notice.status === "destructive"
                ? theme.colors.destructive
                : notice.status === "success"
                  ? theme.colors.success
                  : theme.colors.border,
            backgroundColor: theme.colors.card,
            color: theme.colors.cardForeground,
            fontSize: theme.control["--text-control-track"],
            pointerEvents: "auto",
          }}
        >
          {notice.title ? (
            <div style={{ fontWeight: theme.design.typography.weights.semibold }}>
              {notice.title}
            </div>
          ) : null}
          {(notice.description ?? notice.message) ? (
            <div style={{ color: theme.colors.mutedForeground }}>
              {notice.description ?? notice.message}
            </div>
          ) : null}
          {notice.status === "loading" ? (
            <div role="status" aria-label={loadingLabel}>
              {loadingLabel}…
            </div>
          ) : null}
          <div style={{ display: "flex", gap, justifyContent: "flex-end" }}>
            {notice.action ? (
              <Button
                testId={`${testId}-${notice.id}-action`}
                label={notice.action.label}
                onClick={() => {
                  notice.action?.onClick()
                  dismissToast(notice.id)
                }}
              >
                {notice.action.label}
              </Button>
            ) : null}
            <Button
              testId={`${testId}-${notice.id}-dismiss`}
              variant="ghost"
              label={[dismissLabel, notice.title ?? notice.description ?? notice.message]
                .filter(Boolean)
                .join(" ")}
              onClick={() => dismissToast(notice.id)}
            >
              {dismissLabel}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
