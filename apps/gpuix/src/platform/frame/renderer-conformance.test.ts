import type { GpuixRenderer } from "@gpuix/native"
import type { NativeRenderer } from "@gpuix/native/host"
import type { createAnimationFrameSource, FrameRenderer } from "./animation-frame-source"
import type { useAnimationFrame } from "./AnimationFrameProvider"

type Assert<T extends true> = T

export type RendererSatisfiesFramePort = Assert<GpuixRenderer extends FrameRenderer ? true : false>
export type ReactRendererSatisfiesFrameFactory = Assert<
  NativeRenderer extends Parameters<typeof createAnimationFrameSource>[0] ? true : false
>
export type AnimationFrameHookHasTwoArguments = Assert<
  Parameters<typeof useAnimationFrame>["length"] extends 2 ? true : false
>
