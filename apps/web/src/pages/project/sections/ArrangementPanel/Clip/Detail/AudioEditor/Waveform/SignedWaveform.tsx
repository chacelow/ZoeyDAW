import { Fragment } from "react"
import type { WaveformChannelPath } from "@zoeydaw/project-core/signed-waveform"

export function SignedWaveform({ paths }: { readonly paths: readonly WaveformChannelPath[] }) {
  return (
    <g>
      {paths.map((channel, index) => (
        <Fragment key={index}>
          <path
            className="audio-detail-peak fill-foreground [stroke:none] opacity-60"
            d={channel.path}
            style={{ fill: "var(--foreground)", stroke: "none" }}
          />
          {channel.markers && <path d={channel.markers} fill="var(--foreground)" />}
        </Fragment>
      ))}
    </g>
  )
}
