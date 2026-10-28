import { nativePlugins } from "@/shared/native/plugins"
import { projectActions } from "./commands"
import { whenProjectBackendIdle } from "./context"
import { useProjectState } from "./read-model"
import type { PluginCatalogEntry } from "@/shared/native/plugins"
import type { Track } from "@zoeydaw/project-core/types"

export function acceptsPlugin(track: Track, entry: PluginCatalogEntry): boolean {
  if (entry.plugin.kind !== "Instrument") return true
  return track.kind === "midi"
}

export async function insertBrowserPlugin(
  trackId: string,
  entry: PluginCatalogEntry
): Promise<void> {
  const before = useProjectState.getState()
  const track = before.document.tracks.find(item => item.id === trackId)
  if (!track || !acceptsPlugin(track, entry))
    throw new Error("Plugin cannot be inserted on this track")
  const epoch = before.session.editEpoch
  const session = before.session.backend.sessionId
  if (!session) throw new Error("Project engine is not ready")
  const device = await nativePlugins.prepareDevice(entry.catalogId, session)
  try {
    if (
      device.plugin.catalogId !== entry.catalogId ||
      (entry.plugin.kind === "Instrument") !== (device.plugin.role === "instrument")
    )
      throw new Error("Prepared plugin identity changed")
    const after = useProjectState.getState()
    const target = after.document.tracks.find(item => item.id === trackId)
    if (after.session.editEpoch !== epoch || after.session.backend.sessionId !== session || !target)
      throw new Error("Project changed while preparing the plugin")
    if (!acceptsPlugin(target, entry)) throw new Error("Plugin cannot be inserted on this track")
    const devices = target.devices ?? []
    const nextDevices =
      device.plugin.role === "instrument"
        ? [
            device,
            ...devices.filter(d => !(d.kind === "external" && d.plugin.role === "instrument")),
          ]
        : [...devices, device]
    const groupParent = after.document.tracks.find(
      item => item.kind === "group" && item.childTrackIds?.includes(target.id)
    )
    projectActions.updateTrack(trackId, {
      ...(device.plugin.role === "instrument" && {
        armed: true,
        ...(target.output === "none" && {
          output: groupParent?.id ?? "main",
          outputChannel: "1-2",
        }),
      }),
      devices: nextDevices,
    })
    if (!(await whenProjectBackendIdle())) throw new Error("Plugin insertion failed")
  } finally {
    await nativePlugins.discardSeed(session, device.id)
  }
}

export async function insertPluginNewTrack(entry: PluginCatalogEntry): Promise<string> {
  const trackId = projectActions.addTrack("midi")
  projectActions.updateTrack(trackId, {
    name: entry.plugin.name,
    armed: true,
    output: "main",
    outputChannel: "1-2",
  })
  projectActions.selectTracks([trackId], "header")
  await insertBrowserPlugin(trackId, entry)
  return trackId
}
