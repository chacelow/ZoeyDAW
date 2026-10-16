import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { GpuixRenderer } from "@gpuix/native"
import { createWindowPlatform } from "@/platform/window"

const directory = process.argv[2]
if (!directory) throw new Error("Pass an external evidence directory")
mkdirSync(directory, { recursive: true })
const renderer = new GpuixRenderer()
renderer.init({
  title: "zoeydaw T2 hidden native window",
  width: 640,
  height: 480,
  titlebarTransparent: true,
  focus: false,
  show: false,
})
try {
  const before = renderer.getWindowSize()
  createWindowPlatform(renderer).titlebarDoubleClick()
  renderer.tick()
  await Bun.sleep(50)
  renderer.tick()
  const result = {
    before,
    after: renderer.getWindowSize(),
    preferenceOwner: "GPUI",
    launchShow: false,
  }
  writeFileSync(path.join(directory, "hidden-native-action.json"), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally {
  renderer.closeWindow()
  renderer.tick()
}
