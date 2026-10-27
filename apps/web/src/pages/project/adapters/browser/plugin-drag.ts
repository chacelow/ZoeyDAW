import type { PluginCatalogEntry } from "@/shared/native/plugins"

export const BROWSER_PLUGIN_MIME = "application/x-zoeydaw-browser-plugin"

type PluginDrag = { token: string; entry: PluginCatalogEntry }
const state: { current: PluginDrag | null } = { current: null }

export const browserPluginDrag = {
  start(entry: PluginCatalogEntry) {
    state.current = { token: crypto.randomUUID(), entry }
    return state.current.token
  },
  peek() {
    return state.current?.entry ?? null
  },
  read(token: string) {
    return state.current?.token === token ? state.current.entry : null
  },
  clear() {
    state.current = null
  },
}
