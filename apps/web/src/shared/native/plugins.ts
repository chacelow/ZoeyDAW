import { invoke, isTauri } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { z } from "zod"
import { isDevice, isNativeParameterId } from "@zoeydaw/project-core/devices"
import type { ExternalDevice } from "@zoeydaw/project-core/devices"

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

export const nativePlugins = {
  available: isTauri,
  parameters: async (sessionId: string, deviceId: string): Promise<PluginParameter[]> =>
    z.array(parameter).parse(await invoke("plugin_device_parameters", { sessionId, deviceId })),
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
