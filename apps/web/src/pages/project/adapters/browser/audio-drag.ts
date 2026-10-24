import { create } from "zustand"

export const BROWSER_AUDIO_MIME = "application/x-zoeydaw-browser-audio"
export interface BrowserAudioDragSource {
  readonly token: string
  readonly path: string
  readonly name: string
  readonly durationSeconds: number | null
}

const useState = create<{ source: BrowserAudioDragSource | null }>(() => ({ source: null }))
const previewState: { value: { path: string; durationSeconds: number } | null } = { value: null }

function clear() {
  useState.setState({ source: null })
  window.removeEventListener("blur", clear)
  window.removeEventListener("dragend", clear)
  window.removeEventListener("drop", clear)
  window.removeEventListener("keydown", cancelOnEscape, true)
}
function cancelOnEscape(event: KeyboardEvent) {
  if (event.key !== "Escape") return
  event.preventDefault()
  event.stopPropagation()
  clear()
}

export const browserAudioDrag = {
  useState,
  setPreviewMetadata(value: typeof previewState.value) {
    previewState.value =
      value && Number.isFinite(value.durationSeconds) && value.durationSeconds > 0 ? value : null
  },
  start(input: {
    path: string
    name: string
    durationSeconds: number | null
  }): BrowserAudioDragSource {
    const preview = previewState.value
    const duration = preview?.path === input.path ? preview.durationSeconds : input.durationSeconds
    const source = {
      token: crypto.randomUUID(),
      path: input.path,
      name: input.name,
      durationSeconds:
        duration !== null && Number.isFinite(duration) && duration > 0 ? duration : null,
    }
    useState.setState({ source })
    window.addEventListener("blur", clear)
    window.addEventListener("dragend", clear)
    window.addEventListener("drop", clear)
    window.addEventListener("keydown", cancelOnEscape, true)
    return source
  },
  clear,
  read(token: string): BrowserAudioDragSource | null {
    const { source } = useState.getState()
    return source?.token === token ? source : null
  },
}
