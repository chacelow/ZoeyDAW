import { Spinner } from "./spinner"
import type { Meta, StoryObj } from "@storybook/react"

const meta: Meta<typeof Spinner> = {
  title: "Display/Spinner",
  component: Spinner,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "circle",
        "pinwheel",
        "circle-filled",
        "ellipsis",
        "ring",
        "bars",
        "infinite",
      ],
    },
  },
}

export default meta
type Story = StoryObj<typeof Spinner>

export const Default: Story = {}

export const AllVariants: Story = {
  render: () => (
    <div className="text-foreground grid grid-cols-4 gap-6">
      {(
        [
          "default",
          "circle",
          "pinwheel",
          "circle-filled",
          "ellipsis",
          "ring",
          "bars",
          "infinite",
        ] as const
      ).map(v => (
        <div key={v} className="text-muted-foreground flex flex-col items-center gap-2 text-xs">
          <Spinner variant={v} />
          {v}
        </div>
      ))}
    </div>
  ),
}
