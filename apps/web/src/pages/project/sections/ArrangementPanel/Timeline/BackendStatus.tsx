import { useTranslation } from "@zoeymind/i18n"
import { useSyncExternalStore } from "react"
import { readNativeAudioStatus, subscribeNativeAudioStatus } from "@/shared/native/audio"
import { useProjectState } from "@/pages/project/adapters"

export function BackendStatus() {
  const { t } = useTranslation()
  const snapshotError = useProjectState(state => state.session.snapshotError)
  const backendError = useProjectState(state => state.session.backend.error)
  const backendPhase = useProjectState(state => state.session.backend.phase)
  const nativeStatus = useSyncExternalStore(subscribeNativeAudioStatus, readNativeAudioStatus)
  return (
    <>
      {snapshotError || backendError ? (
        <div
          role="alert"
          className="border-destructive bg-background text-destructive absolute top-14 right-2 z-50 max-w-xs rounded border px-2 py-1 text-xs shadow-lg"
        >
          {snapshotError ?? (backendError ? t(`arrangement.backendError.${backendError}`) : "")}
          {!snapshotError && nativeStatus.error ? (
            <div className="mt-1 break-words">{nativeStatus.error}</div>
          ) : null}
        </div>
      ) : null}
      {!snapshotError &&
        !backendError &&
        (backendPhase === "opening" || backendPhase === "pending") && (
          <div
            role="status"
            className="bg-background text-muted-foreground absolute top-14 right-2 z-50 px-2 py-1 text-xs"
          >
            {t(
              backendPhase === "opening"
                ? "arrangement.backendOpening"
                : "arrangement.backendPending"
            )}
          </div>
        )}
    </>
  )
}
