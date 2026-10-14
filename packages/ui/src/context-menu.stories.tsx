import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "./context-menu"
import type { Meta, StoryObj } from "@storybook/react"

const meta: Meta<typeof ContextMenu> = {
  title: "Overlay/ContextMenu",
  component: ContextMenu,
  tags: ["autodocs"],
}

export default meta
type Story = StoryObj<typeof ContextMenu>

export const Default: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger className="bg-muted/30 text-muted-foreground grid h-40 w-72 place-items-center text-sm">
        在此区域右键
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>
          剪切
          <ContextMenuShortcut>⌘X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>
          复制
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>
          粘贴
          <ContextMenuShortcut>⌘V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive">删除</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
}
