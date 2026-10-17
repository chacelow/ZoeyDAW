import { memo } from "react"
import { useProjectState } from "@/project/adapters"
import { positionToBar } from "@/project/model/types"
import { useTheme } from "@/shared/theme/ThemeProvider"
import { sx } from "@/shared/theme/style"

export const Playhead = memo(function Playhead({
  bars,
  width,
  height,
}: {
  bars: number
  width: number
  height: number
}) {
  const theme = useTheme()
  const position = useProjectState(state =>
    positionToBar(state.session.position, state.document.transport.numerator)
  )
  return (
    <div
      testId="minimap-playhead"
      style={sx({
        position: "absolute",
        top: 0,
        left: ((position - 1) / bars) * width,
        width: theme.design.editor.playheadLineWidth,
        height,
        backgroundColor: theme.colors.primary,
        pointerEvents: "none",
      })}
    />
  )
})
