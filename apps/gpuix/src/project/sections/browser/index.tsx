import { useImperativeHandle, useLayoutEffect, useRef, useState } from "react"
import { useGpuix } from "@gpuix/react"
import {
  Button,
  Chip,
  DragPreviewArea,
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  Input,
  IconSlot,
  List,
  ListRow,
  ScrollArea,
  TruncatedText,
  useInfoBinding,
} from "@/ui/controls"
import { Group, Panel, PanelDivider } from "@/ui/panels"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { Icon } from "@/ui/controls/Icon"
import type { IconName } from "@/ui/controls/Icon"
import type { Props, PublicInstance } from "@gpuix/react"
import type { ReactNode, Ref } from "react"
import type { BrowserKind } from "./catalog"
import type { BrowserLabels } from "./labels"
import { BrowserNavigation } from "./BrowserNavigation"
import { useBrowser } from "./useBrowser"

const CONTENT_KINDS: readonly (BrowserKind | "all")[] = [
  "all",
  "device",
  "preset",
  "sample",
  "midi",
  "clip",
  "groove",
  "tuning",
  "template",
]
const KIND_ICONS: Readonly<Record<BrowserKind, IconName>> = {
  device: "Piano",
  preset: "FileSliders",
  sample: "FileAudio",
  midi: "KeyboardMusic",
  clip: "FileMusic",
  groove: "Music2",
  tuning: "SlidersHorizontal",
  template: "Folder",
}
export interface BrowserBodySlots {
  readonly navigation: ReactNode
  readonly results: ReactNode
}
export interface BrowserPanelHandle {
  readonly focusSearch: () => void
}
export interface BrowserPanelProps {
  readonly labels: BrowserLabels
  readonly browserRef?: Ref<BrowserPanelHandle>
  readonly renderBody?: (slots: BrowserBodySlots) => ReactNode
}

export function BrowserSplitBody({
  navigation,
  results,
  dividerLabel,
}: BrowserBodySlots & { readonly dividerLabel: string }) {
  const theme = useTheme()
  return (
    <Group
      testId="browser-split"
      orientation="horizontal"
      style={{ height: "100%", width: "100%" }}
    >
      <Panel
        defaultSize={theme.project.browserNavigationWidth}
        minSize={theme.control["--spacing-control-track"]}
        collapsible
        collapsedSize={0}
        testId="browser-navigation-panel"
      >
        {navigation}
      </Panel>
      <PanelDivider
        orientation="vertical"
        aria-label={dividerLabel}
        testId="browser-navigation-divider"
        style={{
          backgroundColor: theme.colors.muted,
          borderLeftWidth: theme.design.editor.dividerStrokeWidth,
          borderColor: theme.colors.border,
        }}
      />
      <Panel testId="browser-results-panel" minSize={theme.project.browserResultsWidth}>
        {results}
      </Panel>
    </Group>
  )
}

export function BrowserPanel({
  labels,
  browserRef,
  renderBody = slots => <BrowserSplitBody {...slots} dividerLabel={labels.resizeNavigation} />,
}: BrowserPanelProps) {
  const theme = useTheme()
  const { renderer } = useGpuix()
  const browser = useBrowser(labels)
  const search = useRef<PublicInstance | null>(null)
  const tree = useRef<PublicInstance | null>(null)
  const nodes = useRef(new Map<string, PublicInstance>())
  const [hoveredResource, setHoveredResource] = useState<string | null>(null)
  const [restoreResultsFocus, setRestoreResultsFocus] = useState(false)
  const [focusBySource, setFocusBySource] = useState<
    Partial<Record<typeof browser.source, string>>
  >({})
  const focusedId =
    browser.rows.find(row => row.entry.id === focusBySource[browser.source])?.entry.id ??
    browser.rows[0]?.entry.id
  const resourceInfo = useInfoBinding({ type: "resources" })
  useLayoutEffect(() => {
    if (!restoreResultsFocus) return
    const node = focusedId === undefined ? tree.current : nodes.current.get(focusedId)
    if (node) {
      renderer?.focusElement?.(node.id)
      renderer?.scrollIntoView?.(node.id)
    }
    setRestoreResultsFocus(false)
  }, [restoreResultsFocus, focusedId, renderer])
  const searchInfo = useInfoBinding({ type: "search" })
  const filterInfo = useInfoBinding({ type: "filters" })
  const selectedId = browser.selected?.entry.id
  useImperativeHandle(
    browserRef,
    () => ({
      focusSearch: () => {
        if (search.current) renderer?.focusElement?.(search.current.id)
      },
    }),
    [renderer]
  )
  function focus(id: string) {
    setFocusBySource(previous => ({ ...previous, [browser.source]: id }))
    const node = nodes.current.get(id)
    if (node) {
      renderer?.focusElement?.(node.id)
      renderer?.scrollIntoView?.(node.id)
    }
  }
  function select(id: string) {
    browser.setSelectedId(id)
    focus(id)
  }
  function keyboard(event: Parameters<NonNullable<Props["onKeyDown"]>>[0], rowId?: string) {
    const index = browser.rows.findIndex(row => row.entry.id === (rowId ?? focusedId))
    const row = browser.rows[index]
    let nextIndex = index
    let nextId: string | undefined
    switch (event.key) {
      case "down":
        nextIndex = Math.min(index + 1, browser.rows.length - 1)
        break
      case "up":
        nextIndex = Math.max(index - 1, 0)
        break
      case "home":
        nextIndex = 0
        break
      case "end":
        nextIndex = browser.rows.length - 1
        break
      case "right":
        if (row?.expandable && !row.expanded) browser.toggleExpanded(row.entry.id)
        else if (row?.expanded) nextIndex = index + 1
        break
      case "left":
        if (row?.expanded) browser.toggleExpanded(row.entry.id)
        else if (row?.parentId) nextId = row.parentId
        break
      case "enter":
        if (row) browser.setSelectedId(row.entry.id)
        if (row?.expandable) browser.toggleExpanded(row.entry.id)
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
    const next = browser.rows[nextIndex]
    if (nextId) focus(nextId)
    else if (next) focus(next.entry.id)
  }
  const gap = theme.control["--spacing-control-track-gap"]
  return (
    <div
      role="region"
      aria-label={labels.title}
      testId="browser-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        backgroundColor: theme.colors.muted,
        color: theme.colors.foreground,
        fontSize: theme.control["--text-control-track"],
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap,
          padding: theme.control["--spacing-control-track-pad"],
          flexShrink: 0,
        }}
      >
        <Button
          iconOnly
          label={labels.back}
          disabled={!browser.canGoBack}
          onClick={() => browser.travel("back")}
        >
          <Icon name="ChevronLeft" color={theme.colors.foreground} />
        </Button>
        <Button
          iconOnly
          label={labels.forward}
          disabled={!browser.canGoForward}
          onClick={() => browser.travel("forward")}
        >
          <Icon name="ChevronRight" color={theme.colors.foreground} />
        </Button>
        <Input
          {...searchInfo}
          ref={search}
          value={browser.query}
          aria-label={labels.search}
          placeholder={labels.searchPlaceholder}
          testId="browser-search"
          selectAllOnFocus
          onValueChange={browser.setQuery}
          style={{ minWidth: 0, flexGrow: 1 }}
          onKeyDown={event => {
            if (event.key === "escape") {
              browser.setQuery("")
              setRestoreResultsFocus(true)
            }
          }}
        />
        {browser.query ? (
          <Button
            iconOnly
            label={labels.clearSearch}
            onClick={() => {
              browser.setQuery("")
              if (search.current) renderer?.focusElement?.(search.current.id)
            }}
          >
            <Icon name="X" color={theme.colors.foreground} />
          </Button>
        ) : null}
        <Button
          iconOnly
          label={labels.filters}
          active={browser.filtersVisible}
          onActiveChange={browser.setFiltersVisible}
        >
          <Icon
            name="ListFilter"
            color={
              browser.filtersVisible ? theme.colors.primaryForeground : theme.colors.foreground
            }
          />
        </Button>
      </div>
      <TruncatedText
        style={{
          color: theme.colors.mutedForeground,
          paddingLeft: theme.control["--spacing-control-track-pad"],
          flexGrow: 0,
        }}
      >
        {labels.demonstration}
      </TruncatedText>
      <div style={{ minHeight: 0, flexGrow: 1 }}>
        {renderBody({
          navigation: (
            <BrowserNavigation
              source={browser.source}
              onNavigate={browser.navigate}
              labels={labels}
            />
          ),
          results: (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                minWidth: theme.project.browserResultsWidth,
              }}
            >
              {browser.filtersVisible ? (
                <div
                  {...filterInfo}
                  role="group"
                  aria-label={labels.content}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap,
                    padding: theme.control["--spacing-control-track-pad"],
                    flexShrink: 0,
                  }}
                >
                  {CONTENT_KINDS.map(kind => (
                    <Chip
                      key={kind}
                      selected={browser.kind === kind}
                      label={labels.kinds[kind]}
                      icon={
                        <Icon
                          name="Check"
                          color={
                            browser.kind === kind ? theme.colors.primaryForeground : "transparent"
                          }
                        />
                      }
                      onSelectedChange={() => browser.setKind(kind)}
                    >
                      {labels.kinds[kind]}
                    </Chip>
                  ))}
                </div>
              ) : null}
              <Button
                label={browser.descending ? labels.descending : labels.ascending}
                onClick={() => browser.setDescending(!browser.descending)}
                style={{ justifyContent: "space-between" }}
              >
                <text>{labels.name}</text>
                <Icon
                  name={browser.descending ? "ChevronDown" : "ChevronUp"}
                  color={theme.colors.foreground}
                />
              </Button>
              <ScrollArea
                testId="browser-results"
                fill
                tabIndex={browser.rows.length === 0 ? 0 : -1}
                aria-label={labels.results}
                ref={node => {
                  tree.current = node
                }}
                onKeyDown={keyboard}
                style={{ flexGrow: 1, height: 0 }}
                onMouseEnter={resourceInfo.onMouseEnter}
                onMouseLeave={resourceInfo.onMouseLeave}
              >
                {browser.rows.length === 0 ? (
                  <Empty
                    style={{
                      flexGrow: 0,
                      alignItems: "stretch",
                      justifyContent: "flex-start",
                      textAlign: "left",
                      padding: 0,
                      borderRadius: 0,
                      gap,
                    }}
                  >
                    <EmptyHeader style={{ alignItems: "stretch", maxWidth: "100%", gap }}>
                      <EmptyTitle
                        style={{
                          color: theme.colors.mutedForeground,
                          fontWeight: undefined,
                          textAlign: "left",
                        }}
                      >
                        {labels.empty}
                      </EmptyTitle>
                      <EmptyDescription style={{ textAlign: "left" }}>
                        {labels.emptyHint}
                      </EmptyDescription>
                    </EmptyHeader>
                    {browser.filtering ? (
                      <Button
                        testId="browser-reset-filters"
                        label={labels.resetFilters}
                        onClick={() => {
                          browser.setQuery("")
                          browser.setKind("all")
                        }}
                      >
                        {labels.resetFilters}
                      </Button>
                    ) : null}
                  </Empty>
                ) : (
                  <List role="tree" aria-label={labels.results}>
                    {browser.rows.map(row => (
                      <DragPreviewArea
                        key={row.entry.id}
                        role="presentation"
                        tabIndex={-1}
                        disabledDropLabel={labels.previewDisabled}
                        renderPreview={entry => (
                          <text>{`${entry.name} · ${labels.kinds[entry.kind]} · ${labels.previewDisabled}`}</text>
                        )}
                        onClick={() => select(row.entry.id)}
                        items={[
                          {
                            key: row.entry.id,
                            data: row.entry,
                            label: row.entry.name,
                            children: drag => (
                              <ListRow
                                {...drag}
                                role="treeitem"
                                tabIndex={focusedId === row.entry.id ? 0 : -1}
                                label={row.entry.name}
                                testId={`browser-entry-${row.entry.id}`}
                                selected={selectedId === row.entry.id}
                                ref={node => {
                                  if (node) nodes.current.set(row.entry.id, node)
                                  else nodes.current.delete(row.entry.id)
                                }}
                                aria-level={row.depth + 1}
                                aria-expanded={row.expandable ? row.expanded : undefined}
                                style={{
                                  paddingLeft:
                                    theme.control["--spacing-control-track-pad"] +
                                    row.depth * theme.control["--spacing-control-icon-slot"],
                                }}
                                leading={
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "row",
                                      alignItems: "center",
                                      gap,
                                    }}
                                  >
                                    {row.expandable ? (
                                      <Button
                                        iconOnly
                                        tabIndex={-1}
                                        label={`${row.expanded ? labels.collapse : labels.expand} ${row.entry.name}`}
                                        onClick={() => {
                                          select(row.entry.id)
                                          browser.toggleExpanded(row.entry.id)
                                        }}
                                      >
                                        <Icon
                                          name={row.expanded ? "ChevronDown" : "ChevronRight"}
                                          color={theme.colors.foreground}
                                        />
                                      </Button>
                                    ) : (
                                      <div
                                        aria-hidden="true"
                                        style={{
                                          width: theme.control["--spacing-control-track"],
                                          flexShrink: 0,
                                        }}
                                      />
                                    )}
                                    <IconSlot>
                                      <Icon
                                        name={KIND_ICONS[row.entry.kind]}
                                        color={
                                          selectedId === row.entry.id
                                            ? theme.colors.primaryForeground
                                            : theme.colors.mutedForeground
                                        }
                                      />
                                    </IconSlot>
                                  </div>
                                }
                                trailing={
                                  <Button
                                    iconOnly
                                    tabIndex={-1}
                                    testId={`browser-favorite-${row.entry.id}`}
                                    style={{
                                      opacity:
                                        browser.favorites.has(row.entry.id) ||
                                        selectedId === row.entry.id ||
                                        hoveredResource === row.entry.id
                                          ? 1
                                          : 0,
                                    }}
                                    label={`${browser.favorites.has(row.entry.id) ? labels.unfavorite : labels.favorite} ${row.entry.name}`}
                                    active={browser.favorites.has(row.entry.id)}
                                    onActiveChange={() => browser.toggleFavorite(row.entry.id)}
                                  >
                                    <Icon
                                      name="Star"
                                      filled={browser.favorites.has(row.entry.id)}
                                      color={
                                        browser.favorites.has(row.entry.id)
                                          ? theme.colors.primaryForeground
                                          : theme.colors.foreground
                                      }
                                    />
                                  </Button>
                                }
                                onClick={event => {
                                  select(row.entry.id)
                                  if (event.clickCount === 2 && row.expandable)
                                    browser.toggleExpanded(row.entry.id)
                                }}
                                onMouseEnter={() => setHoveredResource(row.entry.id)}
                                onMouseLeave={() => setHoveredResource(null)}
                                onFocus={() => {
                                  setFocusBySource(previous => ({
                                    ...previous,
                                    [browser.source]: row.entry.id,
                                  }))
                                  resourceInfo.onFocus()
                                }}
                                onBlur={event => {
                                  drag.onBlur(event)
                                  resourceInfo.onBlur()
                                }}
                                onKeyDown={event => keyboard(event, row.entry.id)}
                              />
                            ),
                          },
                        ]}
                      />
                    ))}
                  </List>
                )}
              </ScrollArea>
            </div>
          ),
        })}
      </div>
    </div>
  )
}

export type { BrowserLabels } from "./labels"
export type { BrowserEntry, BrowserKind, BrowserSource } from "./catalog"
