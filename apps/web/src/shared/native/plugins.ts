import { invoke, isTauri } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { z } from "zod"
import { isDevice, isNativeParameterId, isPluginStateRef } from "@zoeydaw/project-core/devices"
import type { ExternalDevice, PluginStateRef } from "@zoeydaw/project-core/devices"

const plugin = z
  .object({
    format: z.enum(["Vst3", "AudioUnit", "Clap"]),
    class_id: z.string().min(1),
    name: z.string(),
    vendor: z.string(),
    version: z.string(),
    sdk_version: z.string(),
    kind: z.enum(["Effect", "Instrument"]),
    categories: z.array(z.string()),
  })
  .strict()
const entry = z.object({ catalogId: z.string().regex(/^[a-f0-9]{64}$/), plugin }).strict()
const report = z
  .object({
    entries: z.array(entry),
    issues: z.array(z.object({ path: z.string(), reason: z.string() }).strict()),
    cancelled: z.boolean(),
  })
  .strict()

export type PluginCatalogEntry = z.infer<typeof entry>
export type PluginScanReport = z.infer<typeof report>

const parameter = z
  .object({
    id: z.string().refine(isNativeParameterId),
    title: z.string(),
    units: z.string(),
    normalized: z.number().finite().min(0).max(1),
    defaultValue: z.number().finite().min(0).max(1).nullable(),
    stepCount: z.number().int().nonnegative(),
    readOnly: z.boolean(),
    automatable: z.boolean(),
    hidden: z.boolean(),
  })
  .strict()
export type PluginParameter = z.infer<typeof parameter>

const nativeId = z.string().refine(isNativeParameterId)
const editorEvent = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("value"),
      id: nativeId,
      normalized: z.number().finite().min(0).max(1),
    })
    .strict(),
  z.object({ kind: z.literal("begin"), id: nativeId }).strict(),
  z.object({ kind: z.literal("end"), id: nativeId }).strict(),
  z.object({ kind: z.literal("metadata") }).strict(),
  z.object({ kind: z.literal("values") }).strict(),
  z.object({ kind: z.literal("dirty"), dirty: z.boolean() }).strict(),
])
const editorResponse = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("opened"),
      instance: nativeId,
      parameters: z.array(parameter).max(4096),
    })
    .strict(),
  z
    .object({
      kind: z.literal("events"),
      instance: nativeId,
      open: z.boolean(),
      events: z.array(editorEvent).max(4096),
      parameters: z.array(parameter).max(4096).nullable(),
      resyncRequired: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("committed"),
      instance: nativeId,
      stateRef: z.custom<PluginStateRef>(isPluginStateRef),
      parameters: z.array(parameter).max(4096),
    })
    .strict(),
  z.object({ kind: z.literal("cancelled"), instance: nativeId }).strict(),
  z.object({ kind: z.literal("released"), instance: nativeId }).strict(),
])
export type PluginEditorRequest =
  | {
      kind: "open"
      parameters: ExternalDevice["parameters"]
      catalogId: string
      stateHash: string | null
    }
  | { kind: "poll" | "commit" | "cancel" | "release"; instance: string }
export type PluginEditorResponse = z.infer<typeof editorResponse>
const editorReplyKinds = {
  open: "opened",
  poll: "events",
  commit: "committed",
  cancel: "cancelled",
  release: "released",
} satisfies Record<PluginEditorRequest["kind"], PluginEditorResponse["kind"]>

export const nativePlugins = {
  available: isTauri,
  parameters: async (sessionId: string, deviceId: string): Promise<PluginParameter[]> =>
    z.array(parameter).parse(await invoke("plugin_device_parameters", { sessionId, deviceId })),
  editor: async (
    sessionId: string,
    deviceId: string,
    request: PluginEditorRequest
  ): Promise<PluginEditorResponse> => {
    const response = editorResponse.parse(
      await invoke("plugin_device_editor", { sessionId, deviceId, request })
    )
    if (
      response.kind !== editorReplyKinds[request.kind] ||
      ("instance" in request && response.instance !== request.instance)
    )
      throw new Error("Invalid plugin editor response owner or operation")
    return response
  },
  snapshot: async (sessionId: string, deviceId: string): Promise<PluginStateRef> => {
    const value: unknown = await invoke("plugin_device_snapshot", { sessionId, deviceId })
    if (!isPluginStateRef(value)) throw new Error("Invalid live plugin state reference")
    return value
  },
  pickFolder: () => open({ directory: true, multiple: false }),
  entries: async (): Promise<PluginCatalogEntry[]> =>
    z.array(entry).parse(await invoke("plugin_catalog_entries")),
  reserve: (operationId: string): Promise<void> =>
    invoke("plugin_catalog_reserve", { operationId }),
  scan: async (
    operationId: string,
    directories: string[],
    audioUnits: string[]
  ): Promise<PluginScanReport> =>
    report.parse(await invoke("plugin_catalog_scan", { operationId, directories, audioUnits })),
  cancel: (operationId: string): Promise<void> => invoke("plugin_catalog_cancel", { operationId }),
  prepareDevice: async (catalogId: string): Promise<ExternalDevice> => {
    const seed: unknown = await invoke("plugin_device_seed", { catalogId })
    if (typeof seed !== "object" || seed === null || Array.isArray(seed))
      throw new Error("Invalid plugin seed")
    const device = { ...seed, id: crypto.randomUUID(), enabled: true, collapsed: false }
    if (!isDevice(device) || device.kind !== "external") throw new Error("Invalid plugin device")
    return device
  },
}
