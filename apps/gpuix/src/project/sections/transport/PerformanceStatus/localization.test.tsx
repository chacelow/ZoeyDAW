import { expect, test } from "bun:test"
import { flushSync } from "@gpuix/react"
import { createTestRoot } from "@gpuix/react/testing"
import { useProjectState } from "@/project/stores/useProjectState"
import type { ProjectRuntimeStatus } from "@/project/model/backend"
import { AnimationFrameProvider } from "@/platform/frame"
import { ThemeProvider } from "@/shared/theme/ThemeProvider"
import { createTestAnimationFrames } from "../../footer/verification/test-frame"
import { chineseTransportLabels } from "@/app/locales/sections/transport"
import { PerformanceStatus } from "."

const phases: Readonly<Record<ProjectRuntimeStatus["phase"], string>> = {
  idle: "空闲",
  opening: "启动中",
  ready: "就绪",
  pending: "同步中",
  error: "错误",
}

test("performance popup renders the injected localized phase for every backend state", () => {
  const labels = { ...chineseTransportLabels, enginePhases: phases }
  const previous = useProjectState.getState().session
  const root = createTestRoot({ width: 600, height: 300 })
  const frames = createTestAnimationFrames()
  try {
    root.render(
      <ThemeProvider>
        <AnimationFrameProvider source={frames}>
          <PerformanceStatus labels={labels} />
        </AnimationFrameProvider>
      </ThemeProvider>
    )
    const trigger = root.renderer.findByTestId("transport-engine")
    if (!trigger) throw new Error("Missing performance trigger")
    root.renderer.nativeSimulateKeystrokes(trigger.id, "enter")
    const states: ProjectRuntimeStatus["phase"][] = ["idle", "opening", "ready", "pending", "error"]
    for (const phase of states) {
      flushSync(() =>
        useProjectState.setState(state => ({
          session: { ...state.session, backend: { ...state.session.backend, phase } },
        }))
      )
      expect(root.renderer.getAllText().join(" ")).toContain(
        `${chineseTransportLabels.engine}: ${phases[phase]}`
      )
      expect(root.renderer.getAllText().join(" ")).not.toContain(
        `${chineseTransportLabels.engine}: ${phase}`
      )
    }
  } finally {
    root.unmount()
    useProjectState.setState({ session: previous })
  }
})
