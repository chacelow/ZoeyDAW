import { memo, useEffect, useRef, type ReactNode } from "react"
import { Group, Panel } from "react-resizable-panels"
import { useTranslation } from "@zoeymind/i18n"
import { PanelDivider } from "@/components/panels"
import { cn } from "@zoeymind/ui"
import { projectActions } from "../adapters"
import { BrowserPanel } from "../sections/BrowserPanel"
import { ArrangementPanel } from "../sections/ArrangementPanel"
import { FooterPanel } from "../sections/FooterPanel"
import type { SectionId } from "../types"

export const WorkspacePanel = memo(function WorkspacePanel({
  id,
  visible,
}: {
  id: SectionId
  visible: boolean
}) {
  const { t } = useTranslation()
  const content = useRef<HTMLDivElement>(null)
  const pointerActive = useRef(false)
  const previous = useRef(visible)
  useEffect(() => {
    if (previous.current && !visible) {
      const focused = document.activeElement
      const owned = focused instanceof HTMLElement && content.current?.contains(focused)
      if (pointerActive.current || owned) projectActions.cancelEdit()
      if (owned) focused.blur()
      pointerActive.current = false
    }
    previous.current = visible
  }, [visible])
  useEffect(() => {
    const element = content.current
    const release = () => {
      pointerActive.current = false
    }
    window.addEventListener("pointerup", release)
    window.addEventListener("pointercancel", release)
    return () => {
      window.removeEventListener("pointerup", release)
      window.removeEventListener("pointercancel", release)
      const focused = document.activeElement
      if (pointerActive.current || (focused instanceof HTMLElement && element?.contains(focused)))
        projectActions.cancelEdit()
    }
  }, [])
  let body: ReactNode
  if (id === "browser")
    body = (
      <BrowserPanel
        renderBody={({ navigation, results }) => (
          <Group orientation="horizontal" className="h-full w-full">
            <Panel defaultSize="32" minSize={36}>
              {navigation}
            </Panel>
            <PanelDivider
              orientation="vertical"
              aria-label={t("project.browser.resizeColumns")}
              className="before:bg-border hover:before:bg-ring focus-visible:before:bg-ring bg-transparent before:pointer-events-none before:absolute before:inset-y-0 before:left-1/2 before:w-px"
            />
            <Panel defaultSize="68" minSize={140}>
              {results}
            </Panel>
          </Group>
        )}
      />
    )
  else if (id === "arrangement") body = <ArrangementPanel />
  else body = <FooterPanel view={id} />
  return (
    <div
      ref={content}
      id={
        id === "clip" ? "project-clip-view" : id === "devices" ? "project-device-view" : undefined
      }
      className={cn("project-workspace-content", id === "arrangement" && "project-arrangement")}
      data-workspace-panel={id}
      data-workspace-visible={visible}
      aria-hidden={!visible}
      inert={!visible}
      onPointerDownCapture={() => {
        pointerActive.current = true
      }}
    >
      {body}
    </div>
  )
})
