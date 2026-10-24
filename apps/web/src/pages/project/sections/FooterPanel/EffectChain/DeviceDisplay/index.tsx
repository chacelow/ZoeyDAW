import type { Device } from "@zoeydaw/project-core/devices"

export function DeviceDisplay({ device }: { readonly device: Device }) {
  let path: string
  switch (device.kind) {
    case "external":
      return (
        <span className="text-muted-foreground">
          {device.plugin.vendor} {device.plugin.format}
        </span>
      )
    case "utility": {
      const width = (device.width / 200) * 70
      const center = 100 + device.pan * 45
      const height = 35 - ((device.gainDb + 60) / 84) * 25
      path = `M ${center - width} 52 L ${center - width} ${height} L ${center + width} ${height} L ${center + width} 52`
      break
    }
    case "filter": {
      const cutoff = 12 + (Math.log(device.frequency / 20) / Math.log(1000)) * 165
      path = `M 0 24 L ${Math.max(0, cutoff - 25)} 24 Q ${cutoff} ${24 - device.resonance * 35} ${cutoff + 8} 26 Q ${cutoff + 24} 52 200 55`
      break
    }
    case "delay": {
      const spacing = 14 + (device.timeMs / 2000) * 34
      path = Array.from({ length: 5 }, (_, index) => {
        const x = 12 + index * spacing
        const height =
          42 * (index === 0 ? 1 - device.mix : device.mix * device.feedback ** (index - 1))
        return `M ${x} 54 L ${x} ${54 - height}`
      }).join(" ")
      break
    }
    case "reverb": {
      const length = 30 + (device.decay / 20) * 160
      const peak = 52 - device.mix * 44
      path = `M 8 54 L 12 ${peak} Q ${12 + device.size * 50} ${peak} ${length} 54`
      break
    }
  }
  return (
    <svg
      viewBox="0 0 200 60"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="bg-background/50 text-primary h-full min-h-8 w-full"
    >
      <path
        d="M 0 54 H 200 M 50 0 V 60 M 100 0 V 60 M 150 0 V 60"
        className="stroke-border"
        strokeWidth="1"
        fill="none"
      />
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
