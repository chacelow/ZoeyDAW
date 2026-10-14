import { RadioGroup, RadioGroupItem } from "./radio-group"
import { Label } from "./label"
import type { Meta, StoryObj } from "@storybook/react"

const meta: Meta<typeof RadioGroup> = {
  title: "Form/RadioGroup",
  component: RadioGroup,
  tags: ["autodocs"],
}

export default meta
type Story = StoryObj<typeof RadioGroup>

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="daily" className="w-64">
      <Label htmlFor="frequency-daily" className="gap-2">
        <RadioGroupItem id="frequency-daily" value="daily" />
        每日
      </Label>
      <Label htmlFor="frequency-weekly" className="gap-2">
        <RadioGroupItem id="frequency-weekly" value="weekly" />
        每周
      </Label>
      <Label htmlFor="frequency-monthly" className="gap-2">
        <RadioGroupItem id="frequency-monthly" value="monthly" />
        每月
      </Label>
    </RadioGroup>
  ),
}

export const Disabled: Story = {
  render: () => (
    <RadioGroup defaultValue="a" disabled className="w-64">
      <Label htmlFor="disabled-a" className="gap-2">
        <RadioGroupItem id="disabled-a" value="a" />
        选项 A
      </Label>
      <Label htmlFor="disabled-b" className="gap-2">
        <RadioGroupItem id="disabled-b" value="b" />
        选项 B
      </Label>
    </RadioGroup>
  ),
}
