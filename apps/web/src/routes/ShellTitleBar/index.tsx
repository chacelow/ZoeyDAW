import { useLocation } from "react-router-dom"
import { TitleBar } from "@/components/layouts/TitleBar"
import { useProjectState } from "@/pages/project/adapters"

export function ShellTitleBar() {
  const location = useLocation()
  const projectName = useProjectState(state => state.document.name)
  return <TitleBar title={location.pathname.startsWith("/project/") ? projectName : undefined} />
}
