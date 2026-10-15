import { useEffect, useState } from "react"
import { render } from "@gpuix/react"

function Probe() {
  const [state, setState] = useState<boolean | "mixed" | undefined>(false)
  useEffect(() => {
    const update = (data: Buffer) => {
      const next = data.toString().trim()
      if (next === "true") setState(true)
      else if (next === "false") setState(false)
      else if (next === "mixed") setState("mixed")
      else if (next === "remove") setState(undefined)
    }
    process.stdin.on("data", update)
    process.stdout.write("F6 AX ready; stdin: true / false / mixed / remove\n")
    return () => {
      process.stdin.off("data", update)
    }
  }, [])
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div role="button" aria-label="F6 pressed button" aria-pressed={state} tabIndex={0}>
        Pressed button
      </div>
      <div role="checkbox" aria-label="F6 checked checkbox" aria-checked={state} tabIndex={0}>
        Checked checkbox
      </div>
    </div>
  )
}

render(<Probe />, { title: "F6 aria toggled AX probe", width: 320, height: 160, focus: false })
