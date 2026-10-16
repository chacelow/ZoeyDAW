import { fileURLToPath } from "node:url"

const mutations: Record<string, { from: string; to: string }> = {
  "double-click-count": {
    from: "event.button === 0 && event.clickCount === 2",
    to: "event.button === 0",
  },
  "primary-button": {
    from: "event.button === 0 && event.clickCount === 2",
    to: "event.clickCount === 2",
  },
  "settings-hitbox": {
    from: 'style={{ pointerEvents: "auto" }}',
    to: 'style={{ pointerEvents: "none" }}',
  },
  "title-hitbox": { from: 'pointerEvents: "none",', to: 'pointerEvents: "auto",' },
}
const name = process.env.T2_MUTATION ?? ""
const mutation = Object.hasOwn(mutations, name) ? mutations[name] : undefined
if (!mutation) throw new Error("Unknown T2_MUTATION")
const target = fileURLToPath(new URL("../TitleBar.tsx", import.meta.url))
const filter = new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
Bun.plugin({
  name: "titlebar-gesture-mutation",
  setup(build) {
    build.onLoad({ filter }, async args => {
      const original = await Bun.file(args.path).text()
      if (original.split(mutation.from).length !== 2)
        throw new Error("Stale titlebar mutation anchor")
      return { contents: original.replace(mutation.from, () => mutation.to), loader: "tsx" }
    })
  },
})
