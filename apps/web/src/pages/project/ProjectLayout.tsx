import { TransportBar } from "./sections/TransportBar"
import { StatusStrip } from "./sections/StatusStrip"
import type { ProjectShellApi } from "./useProjectShell"
import { ProjectWorkspace } from "./workspace/ProjectWorkspace"
import "./project.css"

export interface ProjectLayoutProps {
  readonly projectId: string
  readonly shell: ProjectShellApi
  readonly onBack: () => void
}

export function ProjectLayout({ projectId, shell, onBack }: ProjectLayoutProps) {
  return (
    <div className="bg-card text-foreground flex h-full min-w-0 flex-col">
      <TransportBar onBack={onBack} onToggleBrowser={shell.toggleBrowser} />
      <ProjectWorkspace key={projectId} controller={shell.workspace} />
      <StatusStrip />
    </div>
  )
}
