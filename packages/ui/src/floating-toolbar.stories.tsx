import { BoldIcon, ItalicIcon, LinkIcon, UnderlineIcon } from "lucide-react"
import {
  FloatingToolbar,
  FloatingToolbarButton,
  FloatingToolbarGroup,
  FloatingToolbarSeparator,
} from "./floating-toolbar"
import type { Meta, StoryObj } from "@storybook/react"

const meta: Meta<typeof FloatingToolbar> = {
  title: "Widgets/FloatingToolbar",
  component: FloatingToolbar,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
}

export default meta
type Story = StoryObj<typeof FloatingToolbar>

export const Default: Story = {
  render: () => (
    <div className="bg-muted/30 text-muted-foreground relative grid h-64 w-96 place-items-center text-sm">
      画布区域
      <FloatingToolbar position="custom" className="!static">
        <FloatingToolbarGroup>
          <FloatingToolbarButton active>
            <BoldIcon className="size-4" />
          </FloatingToolbarButton>
          <FloatingToolbarButton>
            <ItalicIcon className="size-4" />
          </FloatingToolbarButton>
          <FloatingToolbarButton>
            <UnderlineIcon className="size-4" />
          </FloatingToolbarButton>
          <FloatingToolbarSeparator />
          <FloatingToolbarButton>
            <LinkIcon className="size-4" />
          </FloatingToolbarButton>
        </FloatingToolbarGroup>
      </FloatingToolbar>
    </div>
  ),
}
