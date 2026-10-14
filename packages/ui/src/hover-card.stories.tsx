import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card"
import { Avatar, AvatarFallback } from "./avatar"
import type { Meta, StoryObj } from "@storybook/react"

const meta: Meta<typeof HoverCard> = {
  title: "Overlay/HoverCard",
  component: HoverCard,
  tags: ["autodocs"],
}

export default meta
type Story = StoryObj<typeof HoverCard>

export const Default: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger
        delay={100}
        render={
          <button type="button" className="underline underline-offset-4">
            @zoey
          </button>
        }
      />
      <HoverCardContent>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>ZM</AvatarFallback>
          </Avatar>
          <div>
            <div className="text-sm font-medium">Zoey Mind</div>
            <div className="text-muted-foreground text-xs">协作愉快</div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
}
