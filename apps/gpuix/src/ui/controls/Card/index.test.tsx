import { expect, test } from "bun:test"
import { createTestRoot } from "@gpuix/react/testing"
import { readOuterBounds } from "../useMeasuredTextWidth"
import { ThemeProvider } from "../../../shared/theme/ThemeProvider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./index"

test("card sections align their content and compact size reduces its inset", () => {
  const root = createTestRoot({ width: 400, height: 300 })
  root.render(
    <ThemeProvider>
      <Card size="sm" testId="card" style={{ width: 300 }}>
        <CardHeader>
          <CardTitle testId="title">Settings</CardTitle>
          <CardDescription>Preferences</CardDescription>
        </CardHeader>
        <CardContent>
          <div testId="options">Options</div>
        </CardContent>
      </Card>
    </ThemeProvider>
  )
  root.renderer.flush()
  const card = root.renderer.findByTestId("card")
  const title = root.renderer.findByTestId("title")
  const options = root.renderer.findByTestId("options")
  if (!card || !title || !options) throw new Error("Card sections missing")
  const compactBounds = readOuterBounds(root.renderer, root.renderer.getElement(options.id))
  const titleBounds = readOuterBounds(root.renderer, root.renderer.getElement(title.id))
  if (!compactBounds || !titleBounds) throw new Error("Card sections not laid out")
  const cardBounds = readOuterBounds(root.renderer, root.renderer.getElement(card.id))
  if (!cardBounds) throw new Error("Card not laid out")
  expect(compactBounds.x).toBeGreaterThanOrEqual(cardBounds.x)
  expect(compactBounds.x + compactBounds.width).toBeLessThanOrEqual(cardBounds.x + cardBounds.width)
  expect(compactBounds.x).toBe(titleBounds.x)
  expect(compactBounds.y).toBeGreaterThan(titleBounds.y)
  root.render(
    <ThemeProvider>
      <Card style={{ width: 300 }}>
        <CardContent>
          <div testId="options">Options</div>
        </CardContent>
      </Card>
    </ThemeProvider>
  )
  root.renderer.flush()
  const defaultOptions = root.renderer.findByTestId("options")
  if (!defaultOptions) throw new Error("Card content missing")
  const defaultBounds = readOuterBounds(root.renderer, root.renderer.getElement(defaultOptions.id))
  if (!defaultBounds) throw new Error("Card content not laid out")
  expect(defaultBounds.x).toBeGreaterThan(compactBounds.x)
  root.unmount()
})

test("clickable cards respond to native pointer and keyboard activation", () => {
  let calls = 0
  const root = createTestRoot({ width: 400, height: 300 })
  root.render(
    <ThemeProvider>
      <Card
        testId="card"
        style={{ width: 200, height: 80 }}
        onClick={() => {
          calls += 1
        }}
      >
        Open
      </Card>
    </ThemeProvider>
  )
  root.renderer.flush()
  const card = root.renderer.findByTestId("card")
  if (!card) throw new Error("Card missing")
  root.renderer.nativeSimulateClick(30, 30)
  root.renderer.nativeSimulateKeystrokes(card.id, "enter")
  expect(calls).toBe(2)
  root.unmount()
})
