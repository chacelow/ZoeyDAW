import { MetalFx } from "metal-fx"

import { Button } from "./button"
import { cn } from "./cn"
import type { ComponentProps } from "react"

type MetallicButtonProperties = ComponentProps<typeof Button> & {
  readonly metalTheme?: "dark" | "light" | "auto"
  readonly metalScale?: number
  readonly metalPaused?: boolean
}
function supportsWebGL(): boolean {
  return typeof WebGLRenderingContext !== "undefined"
}

function MetallicButton({
  className,
  children,
  metalTheme = "auto",
  metalScale = 1,
  metalPaused = false,
  ...properties
}: MetallicButtonProperties) {
  const button = (
    <Button
      data-slot="metallic-button"
      className={cn(
        "bg-background text-foreground relative rounded-full border-0 px-3 active:translate-y-0 active:scale-[0.96]",
        className
      )}
      {...properties}
    >
      {children}
    </Button>
  )

  if (!supportsWebGL()) {
    return button
  }

  return (
    <MetalFx
      variant="button"
      borderRadius={Number.MAX_SAFE_INTEGER}
      preset="chromatic"
      theme={metalTheme}
      strength={0.7}
      paused={metalPaused}
      scale={metalScale}
      className="inline-flex rounded-full"
    >
      {button}
    </MetalFx>
  )
}

export { MetallicButton }
export type { MetallicButtonProperties as MetallicButtonProps }
