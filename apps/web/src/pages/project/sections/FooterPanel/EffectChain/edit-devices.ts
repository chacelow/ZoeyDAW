import { projectActions, useProjectState } from "@/pages/project/adapters"
import type { Device } from "@/pages/project/model/devices"

export function editDevices(trackId: string, edit: (devices: Device[]) => Device[]): void {
  const track = useProjectState.getState().document.tracks.find(item => item.id === trackId)
  if (!track) return
  const current = track.devices ?? []
  const devices = edit(current)
  if (
    devices === current ||
    (devices.length === current.length &&
      devices.every((device, index) => device === current[index]))
  )
    return
  projectActions.updateTrack(trackId, { devices })
}

export function reorderDevice(devices: Device[], id: string, destination: number): Device[] {
  const source = devices.findIndex(device => device.id === id)
  const device = devices[source]
  const target = Math.max(0, Math.min(devices.length - 1, destination))
  if (!device || source === target) return devices
  const reordered = devices.filter(item => item.id !== id)
  reordered.splice(target, 0, device)
  return reordered
}
