import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, RefreshCw, Search, X } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import { Button, Input, Separator } from "@zoeymind/ui"
import { browserLibrary } from "@/pages/project/adapters/browser"
import { useBrowser } from "./useBrowser"
import { BrowserNavigation } from "./BrowserNavigation"
import { BrowserTree } from "./BrowserTree"
import { BrowserPreview } from "./BrowserPreview"
import { BrowserPlugins } from "./BrowserPlugins"
import type { ReactNode } from "react"

export interface BrowserPanelProps {
  readonly renderBody: (slots: { navigation: ReactNode; results: ReactNode }) => ReactNode
}
export function BrowserPanel({ renderBody }: BrowserPanelProps) {
  const { t } = useTranslation()
  const browser = useBrowser()
  const [pluginRefresh, setPluginRefresh] = useState(0)
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const node = search.current
      if (
        event.defaultPrevented ||
        document.activeElement?.closest("[role='dialog']") ||
        node?.closest('[data-workspace-visible="false"], [inert]') ||
        !node?.getBoundingClientRect().width
      )
        return
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") return
      event.preventDefault()
      node.focus()
      node.select()
    }
    window.addEventListener("keydown", focusSearch)
    return () => window.removeEventListener("keydown", focusSearch)
  }, [])
  return (
    <section
      aria-label={t("project.sidebarTitle")}
      className="flex h-full min-w-0 flex-col text-xs"
    >
      <div className="flex shrink-0 items-center gap-1 p-1">
        <Button
          size="control-icon"
          variant="ghost"
          disabled={!browser.canGoBack}
          aria-label={t("project.browser.back")}
          onClick={() => browser.travel("back")}
        >
          <ChevronLeft />
        </Button>
        <Button
          size="control-icon"
          variant="ghost"
          disabled={!browser.canGoForward}
          aria-label={t("project.browser.forward")}
          onClick={() => browser.travel("forward")}
        >
          <ChevronRight />
        </Button>
        <div className="relative min-w-0 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-1 size-3 -translate-y-1/2" />
          <Input
            ref={search}
            value={browser.query}
            aria-label={t("project.browser.search")}
            placeholder={t("project.browser.searchPlaceholder")}
            className="pr-5 pl-5 text-xs md:text-xs"
            onChange={event => browserLibrary.setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Escape") browserLibrary.setQuery("")
            }}
          />
          {browser.query ? (
            <Button
              variant="ghost"
              size="control-icon"
              className="absolute top-1/2 right-0 -translate-y-1/2"
              aria-label={t("project.browser.clearSearch")}
              onClick={() => browserLibrary.setQuery("")}
            >
              <X />
            </Button>
          ) : null}
        </div>
      </div>
      <Separator />
      <div className="flex min-h-0 flex-1">
        {renderBody({
          navigation: (
            <BrowserNavigation
              source={browser.scope}
              roots={browser.roots}
              onNavigate={browser.navigate}
              busy={browser.busy}
            />
          ),
          results: (
            <div className="flex h-full min-w-0 flex-col">
              <div className="text-muted-foreground flex shrink-0 items-center gap-1 px-1 py-1">
                <span className="min-w-0 flex-1">{t("project.browser.name")}</span>
                <span className="text-[10px]">{t("browser.size")}</span>
                <Button
                  size="control-icon"
                  variant="ghost"
                  aria-label={t("browser.refresh")}
                  onClick={() => {
                    if (["plugins", "instruments", "audioEffects"].includes(browser.scope))
                      setPluginRefresh(value => value + 1)
                    else if (browser.rootId) void browserLibrary.refreshRoot(browser.rootId)
                    else {
                      void browserLibrary.refreshRoots()
                      void browserLibrary.loadWindow(browser.offset)
                    }
                  }}
                >
                  <RefreshCw />
                </Button>
              </div>
              {browser.roots
                .filter(root => root.status === "scanning")
                .map(root => (
                  <div key={root.id} className="text-muted-foreground flex items-center gap-1 px-1">
                    <span role="status" className="min-w-0 flex-1 truncate">
                      {root.name} · {root.scannedFiles}
                    </span>
                    <Button
                      variant="ghost"
                      size="control-icon"
                      aria-label={t("browser.cancelScan")}
                      onClick={() => {
                        if (root.operationId) void browserLibrary.cancelScan(root.operationId)
                      }}
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              {browser.error ? (
                <p role="alert" className="text-destructive px-1">
                  {browser.error === "nativeUnavailable"
                    ? t("browser.errors.nativeUnavailable")
                    : browser.error}
                </p>
              ) : null}
              {browser.scope === "plugins" ||
              browser.scope === "instruments" ||
              browser.scope === "audioEffects" ? (
                <BrowserPlugins
                  scope={browser.scope}
                  query={browser.query}
                  refresh={pluginRefresh}
                />
              ) : (
                <>
                  <BrowserTree state={browser} />
                  <BrowserPreview state={browser} />
                </>
              )}
            </div>
          ),
        })}
      </div>
    </section>
  )
}
