import { Input } from "./input"
import { Label } from "./label"
import type { Meta, StoryObj } from "@storybook/react"

const meta: Meta = {
  title: "Layout/Field",
  tags: ["autodocs"],
}

export default meta

export const BasicField: StoryObj = {
  render: () => (
    <div className="flex w-72 flex-col gap-2">
      <Label htmlFor="email">邮箱</Label>
      <Input id="email" type="email" placeholder="you@zoey.dev" />
      <p className="text-muted-foreground text-xs">仅用于登录，不会公开</p>
    </div>
  ),
}

export const InvalidField: StoryObj = {
  render: () => (
    <div className="flex w-72 flex-col gap-2">
      <Label htmlFor="email-2">邮箱</Label>
      <Input id="email-2" type="email" defaultValue="not-an-email" aria-invalid />
      <p className="text-destructive text-xs">邮箱格式不正确</p>
    </div>
  ),
}
