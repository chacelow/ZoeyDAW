import { AnimatedGridPattern } from "./animated-grid-pattern"
import type { Meta, StoryObj } from "@storybook/react"

const meta: Meta<typeof AnimatedGridPattern> = {
  title: "Motion/AnimatedGridPattern",
  component: AnimatedGridPattern,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
}

export default meta
type Story = StoryObj<typeof AnimatedGridPattern>

export const Default: Story = {
  render: () => (
    <div className="bg-background relative h-72 w-full max-w-2xl overflow-hidden">
      <AnimatedGridPattern
        className="[mask-image:radial-gradient(60%_50%_at_center,white,transparent)]"
        numSquares={30}
        maxOpacity={0.4}
        duration={3}
      />
      <div className="text-muted-foreground absolute inset-0 grid place-items-center text-sm">
        动画栅格背景
      </div>
    </div>
  ),
}
