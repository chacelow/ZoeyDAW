import { invoke, isTauri } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { z } from "zod"

const browserRoot = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  status: z.enum(["scanning", "ready", "offline", "cancelled", "error"]),
  operationId: z.string().nullable(),
  scannedFiles: z.number().int().nonnegative(),
  audioFiles: z.number().int().nonnegative(),
  error: z.string().nullable(),
})
export const browserItemSchema = z.object({
  id: z.string(),
  rootId: z.string(),
  name: z.string(),
  path: z.string(),
  relativePath: z.string(),
  byteLength: z.number().nonnegative(),
  modifiedMillis: z.number().nonnegative(),
})
export const browserTreeRowSchema = browserItemSchema.extend({
  kind: z.enum(["folder", "audio"]),
  depth: z.number().int().nonnegative(),
  hasChildren: z.boolean(),
})
const browserRoots = z.object({
  revision: z.number().int().nonnegative(),
  roots: z.array(browserRoot),
})
const browserTreePage = z.object({
  requestId: z.string(),
  revision: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  items: z.array(browserTreeRowSchema).max(500),
})
export type BrowserRoot = z.infer<typeof browserRoot>
export type BrowserRoots = z.infer<typeof browserRoots>
export type BrowserItem = z.infer<typeof browserItemSchema>
export type BrowserTreeRow = z.infer<typeof browserTreeRowSchema>
export type BrowserTreePage = z.infer<typeof browserTreePage>
export interface BrowserTreeRequest {
  rootId: string | null
  query: string
  expanded: string[]
  offset: number
  limit: number
  requestId: string
}

export const nativeBrowserCatalog = {
  available: isTauri,
  pickFolder: () => open({ directory: true, multiple: false }),
  roots: async (): Promise<BrowserRoots> => browserRoots.parse(await invoke("browser_roots")),
  addRoot: async (path: string, operationId: string): Promise<BrowserRoots> =>
    browserRoots.parse(await invoke("browser_add_root", { path, operationId })),
  refreshRoot: async (rootId: string, operationId: string): Promise<BrowserRoots> =>
    browserRoots.parse(await invoke("browser_refresh_root", { rootId, operationId })),
  cancelScan: (operationId: string): Promise<void> =>
    invoke("browser_cancel_scan", { operationId }),
  removeRoot: async (rootId: string): Promise<BrowserRoots> =>
    browserRoots.parse(await invoke("browser_remove_root", { rootId })),
  tree: async (request: BrowserTreeRequest): Promise<BrowserTreePage> =>
    browserTreePage.parse(await invoke("browser_tree", { ...request })),
}
