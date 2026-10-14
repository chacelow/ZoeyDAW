// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { cn } from "@zoeymind/ui"

describe("shared control token merging", () => {
  it("keeps font size when an active foreground color changes", () => {
    const result = cn("text-control text-foreground", "text-primary-foreground").split(" ")
    expect(result).toContain("text-control")
    expect(result).toContain("text-primary-foreground")
    expect(result).not.toContain("text-foreground")
  })

  it("merges compact font size independently of color", () => {
    expect(cn("text-control", "text-control-compact", "text-muted-foreground")).toBe(
      "text-control-compact text-muted-foreground"
    )
  })

  it("keeps dense track sizing independent of active colors", () => {
    expect(
      cn(
        "text-control-compact h-control-compact",
        "text-control-track h-control-track text-primary-foreground"
      )
    ).toBe("text-control-track h-control-track text-primary-foreground")
  })

  it("lets the declared control dimension replace an icon slot dimension", () => {
    expect(cn("size-control-icon-slot", "size-control-h")).toBe("size-control-h")
  })
})
