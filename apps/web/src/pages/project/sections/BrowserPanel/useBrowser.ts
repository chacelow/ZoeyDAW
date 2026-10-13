import { useState } from "react"
import {
  BROWSER_ENTRIES,
  INITIAL_FAVORITES,
  type BrowserEntry,
  type BrowserKind,
  type BrowserSource,
} from "./browserData"

export interface BrowserRow {
  entry: BrowserEntry
  depth: number
  parentId: string | null
  expandable: boolean
  expanded: boolean
}

interface BrowserHistory {
  back: BrowserSource[]
  current: BrowserSource
  forward: BrowserSource[]
}

export function useBrowser() {
  const [history, setHistory] = useState<BrowserHistory>({ back: [], current: "all", forward: [] })
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState<BrowserKind | "all">("all")
  const [favorites, setFavorites] = useState(() => new Set(INITIAL_FAVORITES))
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selection, setSelection] = useState<Partial<Record<BrowserSource, string>>>({})
  const [descending, setDescending] = useState(false)
  const [filtersVisible, setFiltersVisible] = useState(true)
  const source = history.current
  const selectedId = selection[source]
  const search = query.trim().toLocaleLowerCase()
  const filtering = search.length > 0 || kind !== "all"
  const expansionContext = filtering ? `${source}/${kind}/${search}` : "browse"

  function matchesSource(entry: BrowserEntry) {
    if (source === "all") return true
    if (source === "favorites") return favorites.has(entry.id)
    if (source === "purple") return entry.purple
    return entry.category === source || entry.place === source
  }

  function filterEntries(
    entries: readonly BrowserEntry[],
    inherited = { source: false, search: false }
  ): BrowserEntry[] {
    return entries
      .flatMap<BrowserEntry>(entry => {
        const matchesScope = inherited.source || matchesSource(entry)
        const matchesSearch =
          inherited.search ||
          !search ||
          `${entry.name} ${entry.tags.join(" ")}`.toLocaleLowerCase().includes(search)
        const matches = matchesScope && matchesSearch && (kind === "all" || entry.kind === kind)
        if (entry.kind !== "device") return matches ? [entry] : []
        const children = filterEntries(entry.children, {
          source: matchesScope,
          search: matchesSearch && matchesScope,
        })
        return matches || children.length ? [{ ...entry, children }] : []
      })
      .sort((a, b) => (descending ? -1 : 1) * a.name.localeCompare(b.name))
  }

  const rows: BrowserRow[] = []
  function addRows(entries: readonly BrowserEntry[], depth: number, parentId: string | null) {
    for (const entry of entries) {
      const expandable = entry.kind === "device" && entry.children.length > 0
      const isExpanded = expandable && (expanded[`${expansionContext}/${entry.id}`] ?? filtering)
      rows.push({ entry, depth, parentId, expandable, expanded: isExpanded })
      if (entry.kind === "device" && isExpanded) addRows(entry.children, depth + 1, entry.id)
    }
  }
  addRows(filterEntries(BROWSER_ENTRIES), 0, null)
  const selected = rows.find(row => row.entry.id === selectedId)

  function setSelectedId(id: string) {
    setSelection(previous => ({ ...previous, [source]: id }))
  }

  function navigate(next: BrowserSource) {
    if (next === source) return
    setHistory(previous => ({
      back: [...previous.back, previous.current],
      current: next,
      forward: [],
    }))
    setKind("all")
  }

  function travel(direction: "back" | "forward") {
    setHistory(previous => {
      const next = previous[direction].at(-1)
      if (!next) return previous
      return direction === "back"
        ? {
            back: previous.back.slice(0, -1),
            current: next,
            forward: [...previous.forward, previous.current],
          }
        : {
            back: [...previous.back, previous.current],
            current: next,
            forward: previous.forward.slice(0, -1),
          }
    })
    setKind("all")
  }

  function toggleExpanded(id: string) {
    const key = `${expansionContext}/${id}`
    setExpanded(previous => ({ ...previous, [key]: !(previous[key] ?? filtering) }))
  }

  function toggleFavorite(id: string) {
    setFavorites(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return {
    source,
    query,
    setQuery,
    kind,
    setKind,
    favorites,
    toggleFavorite,
    rows,
    selected,
    setSelectedId,
    toggleExpanded,
    navigate,
    travel,
    canGoBack: history.back.length > 0,
    canGoForward: history.forward.length > 0,
    descending,
    setDescending,
    filtersVisible,
    setFiltersVisible,
    filtering,
  }
}
