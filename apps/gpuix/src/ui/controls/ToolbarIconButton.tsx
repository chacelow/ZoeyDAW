import { Button } from "./Button"
import type { ButtonProps } from "./Button"

export function ToolbarIconButton(props: Omit<ButtonProps, "variant" | "iconOnly">) {
  return <Button {...props} variant="ghost" iconOnly />
}
