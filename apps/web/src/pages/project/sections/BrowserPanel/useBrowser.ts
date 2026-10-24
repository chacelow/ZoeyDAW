import { useEffect, useState } from "react"
import { browserLibrary, useBrowserLibraryState } from "@/pages/project/adapters/browser"
import type { BrowserSource } from "./browserData"

interface BrowserHistory {
  back: string[]
  current: string
  forward: string[]
}

export function useBrowser() {
  const state = useBrowserLibraryState()
  const [history, setHistory] = useState<BrowserHistory>({
    back: [],
    current: state.scope,
    forward: [],
  })
  useEffect(() => browserLibrary.start(), [])

  function activate(source: string) {
    const root = state.roots.find(root => `root:${root.id}` === source)
    browserLibrary.setScope(source, root?.id ?? null)
  }
  function navigate(source: BrowserSource | `root:${string}`) {
    if (source === history.current) return
    setHistory(previous => ({
      back: [...previous.back, previous.current],
      current: source,
      forward: [],
    }))
    activate(source)
  }
  function travel(direction: "back" | "forward") {
    const next = history[direction].at(-1)
    if (!next) return
    setHistory(previous =>
      direction === "back"
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
    )
    activate(next)
  }
  const selected = state.selection[state.scope] ?? null
  return {
    ...state,
    selected,
    navigate,
    travel,
    canGoBack: history.back.length > 0,
    canGoForward: history.forward.length > 0,
  }
}
