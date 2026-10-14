import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer"
import { Button } from "./button"
import type { Meta, StoryObj } from "@storybook/react"

const meta: Meta<typeof Drawer> = {
  title: "Overlay/Drawer",
  component: Drawer,
  tags: ["autodocs"],
}

export default meta
type Story = StoryObj<typeof Drawer>

export const Default: Story = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">打开抽屉</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>快速筛选</DrawerTitle>
          <DrawerDescription>移动端友好的底部抽屉。</DrawerDescription>
        </DrawerHeader>
        <div className="text-muted-foreground px-4 py-2 text-sm">Drawer 内容区。</div>
        <DrawerFooter>
          <Button>应用</Button>
          <DrawerClose asChild>
            <Button variant="outline">取消</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  ),
}
