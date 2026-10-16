import { useSyncExternalStore } from "react"
import { getReducedMotion, subscribeReducedMotion } from "@/platform/window"
import { readProjectPeaks, useProjectState } from "@/project/adapters"
import { BrowserPanel } from "@/project/sections/browser"
import { FooterPanel } from "@/project/sections/footer"
import { ClipEditor } from "@/project/sections/clip-edit"
import { TransportBar } from "@/project/sections/transport"
import { StatusStrip } from "@/project/sections/status"
import { createNativeClipboard } from "@/platform/clipboard"
import { useAppTranslation } from "../i18n"
import { useControlInfo } from "../interaction"
import { useAppNativeEnvironment } from "../native-environment"
import { useRouter } from "../router/router"
import { englishFooterLabels, chineseFooterLabels } from "../locales/sections/footer"
import { englishBrowserLabels, chineseBrowserLabels } from "../locales/sections/browser"
import { englishTransportLabels, chineseTransportLabels } from "../locales/sections/transport"
import { englishStatusLabels, chineseStatusLabels } from "../locales/sections/status"
import { englishLabels, chineseLabels } from "../locales/sections/timeline"
import { clipEditorLabels } from "../locales/sections/clip-edit"
import { ArrangementPanel } from "./ArrangementPanel"
import { ProjectLayout } from "./ProjectLayout"
import type { ProjectComposition } from "./composition"
import type { ProjectShellApi } from "./useProjectShell"
import type { ProjectLayoutProps } from "./ProjectLayout"
import type { BrowserPanelHandle } from "@/project/sections/browser"
import type { Ref } from "react"

export function ProjectSections({
  composition,
  browserRef,
  ...layout
}: {
  readonly composition: ProjectComposition
  readonly browserRef: Ref<BrowserPanelHandle>
  readonly projectId: string
  readonly shell: ProjectShellApi
  readonly focusRef: ProjectLayoutProps["focusRef"]
  readonly labels: ProjectLayoutProps["labels"]
}) {
  const { locale } = useAppTranslation()
  const zh = locale === "zh-CN"
  const router = useRouter()
  const { subscribeWindowActive } = useAppNativeEnvironment()
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion)
  const info = useControlInfo()
  const backendError = useProjectState(state => state.session.backend.error)
  const snapshotError = useProjectState(state => state.session.snapshotError)
  const timelineLabels = zh ? chineseLabels : englishLabels
  const warning = snapshotError
    ? timelineLabels.snapshotErrors[snapshotError]
    : backendError
      ? timelineLabels.backendErrors[backendError]
      : null
  const { shell } = layout
  return (
    <ProjectLayout
      {...layout}
      transport={
        <TransportBar
          labels={zh ? chineseTransportLabels : englishTransportLabels}
          onBack={() => router.navigate({ kind: "home" })}
          onToggleBrowser={shell.toggleBrowser}
          onDrawModeChange={composition.timeline.keyboard.latchDraw}
          reducedMotion={reducedMotion}
        />
      }
      browser={
        <BrowserPanel
          labels={zh ? chineseBrowserLabels : englishBrowserLabels}
          browserRef={browserRef}
        />
      }
      arrangement={<ArrangementPanel composition={composition} />}
      footer={
        <FooterPanel
          labels={zh ? chineseFooterLabels : englishFooterLabels}
          view={shell.footerView}
          collapsed={shell.footerCollapsed}
          onCollapsedChange={shell.setFooterCollapsed}
          subscribeWindowActive={subscribeWindowActive}
          renderClipEditor={({ clipId, trackId, close }) => (
            <ClipEditor
              clipId={clipId}
              trackId={trackId}
              close={close}
              labels={clipEditorLabels[zh ? "zh" : "en"]}
              readPeaks={readProjectPeaks}
              environment={{
                clipboard: createNativeClipboard(),
                subscribeWindowActive,
                drawMode: {
                  markGesture: composition.timeline.keyboard.markDrawGesture,
                  latch: composition.timeline.keyboard.latchDraw,
                },
                onRegionKey: composition.onClipRegionKey,
              }}
            />
          )}
        />
      }
      status={
        <StatusStrip
          labels={zh ? chineseStatusLabels : englishStatusLabels}
          footerCollapsed={shell.footerCollapsed}
          view={shell.footerView}
          onToggleFooter={shell.toggleFooter}
          onViewChange={shell.selectFooterView}
          info={info}
          warnings={warning ? [{ message: warning, severity: "error" }] : []}
        />
      }
    />
  )
}
