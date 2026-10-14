import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet"
import { Button } from "./button"
import type { Meta, StoryObj } from "@storybook/react"

const meta: Meta<typeof Sheet> = {
  title: "Overlay/Sheet",
  component: Sheet,
  tags: ["autodocs"],
}

export default meta
type Story = StoryObj<typeof Sheet>

function Demo(properties: { side: "top" | "right" | "bottom" | "left" }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">从 {properties.side} 打开</Button>
      </SheetTrigger>
      <SheetContent side={properties.side}>
        <SheetHeader>
          <SheetTitle>筛选</SheetTitle>
          <SheetDescription>调整列表的筛选条件。</SheetDescription>
        </SheetHeader>
        <div className="text-muted-foreground px-4 py-2 text-sm">Sheet 内容区。</div>
        <SheetFooter>
          <SheetClose asChild>
            <Button>确定</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export const Right: Story = { render: () => <Demo side="right" /> }
export const Left: Story = { render: () => <Demo side="left" /> }
export const Top: Story = { render: () => <Demo side="top" /> }
export const Bottom: Story = { render: () => <Demo side="bottom" /> }
