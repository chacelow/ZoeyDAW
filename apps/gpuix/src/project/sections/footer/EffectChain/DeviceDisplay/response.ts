import { cubicPath, polylinePath, segmentsPath } from "@/shared/svg/paths"
import type { CubicSegment, Point } from "@/shared/svg/paths"
import type { Device } from "@/project/model/devices"

export const DEVICE_DISPLAY_VIEWBOX = { width: 200, height: 60 }

export function quadraticAsCubic(start: Point, control: Point, end: Point): CubicSegment {
  return {
    control1: {
      x: start.x + (2 / 3) * (control.x - start.x),
      y: start.y + (2 / 3) * (control.y - start.y),
    },
    control2: {
      x: end.x + (2 / 3) * (control.x - end.x),
      y: end.y + (2 / 3) * (control.y - end.y),
    },
    end,
  }
}

export const DEVICE_GRID_PATH = segmentsPath([
  [
    { x: 0, y: 54 },
    { x: DEVICE_DISPLAY_VIEWBOX.width, y: 54 },
  ],
  [
    { x: 50, y: 0 },
    { x: 50, y: DEVICE_DISPLAY_VIEWBOX.height },
  ],
  [
    { x: 100, y: 0 },
    { x: 100, y: DEVICE_DISPLAY_VIEWBOX.height },
  ],
  [
    { x: 150, y: 0 },
    { x: 150, y: DEVICE_DISPLAY_VIEWBOX.height },
  ],
])

export function deviceResponsePath(device: Device): string {
  switch (device.kind) {
    case "utility": {
      const width = (device.width / 200) * 70
      const center = 100 + device.pan * 45
      const height = 35 - ((device.gainDb + 60) / 84) * 25
      return polylinePath([
        { x: center - width, y: 52 },
        { x: center - width, y: height },
        { x: center + width, y: height },
        { x: center + width, y: 52 },
      ])
    }
    case "filter": {
      const cutoff = 12 + (Math.log(device.frequency / 20) / Math.log(1000)) * 165
      const start = { x: 0, y: 24 }
      const shoulder = { x: Math.max(0, cutoff - 25), y: 24 }
      const bend = { x: cutoff + 8, y: 26 }
      return cubicPath(start, [
        { control1: start, control2: shoulder, end: shoulder },
        quadraticAsCubic(shoulder, { x: cutoff, y: 24 - device.resonance * 35 }, bend),
        quadraticAsCubic(
          bend,
          { x: cutoff + 24, y: 52 },
          { x: DEVICE_DISPLAY_VIEWBOX.width, y: 55 }
        ),
      ])
    }
    case "delay": {
      const spacing = 14 + (device.timeMs / 2000) * 34
      return segmentsPath(
        Array.from({ length: 5 }, (_, index): readonly [Point, Point] => {
          const x = 12 + index * spacing
          const height =
            42 * (index === 0 ? 1 - device.mix : device.mix * device.feedback ** (index - 1))
          return [
            { x, y: 54 },
            { x, y: 54 - height },
          ]
        })
      )
    }
    case "reverb": {
      const start = { x: 8, y: 54 }
      const peak = { x: 12, y: 52 - device.mix * 44 }
      return cubicPath(start, [
        { control1: start, control2: peak, end: peak },
        quadraticAsCubic(
          peak,
          { x: 12 + device.size * 50, y: peak.y },
          { x: 30 + (device.decay / 20) * 160, y: 54 }
        ),
      ])
    }
  }
}
