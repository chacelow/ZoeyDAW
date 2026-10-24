import { useState } from "react"
import { Circle, Folder, Pause, Play, RotateCcw, Square, Star } from "lucide-react"
import { useTranslation } from "@zoeymind/i18n"
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ControlGroup,
  DragPadNumber,
  DragPadToggle,
} from "@zoeymind/ui"
import { GallerySection } from "./gallery-section"

export function CompositionDemos() {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(() => new Set())
  return (
    <>
      <GallerySection id="toolbars">
        <ToolbarPreview profile="default" />
        <ToolbarPreview profile="transport" />
        <div className="gap-control-gap flex flex-wrap items-center">
          {(
            ["none", "slash", "dot", "line"] satisfies Array<"none" | "slash" | "dot" | "line">
          ).map(separator => (
            <ControlGroup
              key={separator}
              separator={separator}
              label={t(`library.catalog.demo.separator-${separator}`)}
            >
              <Button variant="secondary" size="control" onClick={() => setSelected(separator)}>
                4
              </Button>
              <Button variant="secondary" size="control" onClick={() => setSelected(separator)}>
                4
              </Button>
            </ControlGroup>
          ))}
        </div>
      </GallerySection>
      <GallerySection id="projects">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { id: "session", tracks: 12, bpm: 120 },
            { id: "sketch", tracks: 4, bpm: 96 },
          ].map(project => (
            <Card key={project.id} size="sm" className="bg-muted/30 gap-3 rounded-sm ring-0">
              <CardHeader className="rounded-none">
                <CardTitle className="gap-control-gap flex items-center text-xs">
                  <Folder className="text-muted-foreground size-control-icon" />
                  {t(`library.projects.${project.id}`)}
                </CardTitle>
                <CardDescription className="text-[11px]">
                  {t(`library.projects.${project.id}Hint`)}
                </CardDescription>
                <CardAction>
                  <Button
                    variant="ghost"
                    size="control-icon"
                    aria-label={t("library.projects.favorite")}
                    aria-pressed={favorites.has(project.id)}
                    onClick={() =>
                      setFavorites(value => {
                        const next = new Set(value)
                        if (next.has(project.id)) next.delete(project.id)
                        else next.add(project.id)
                        return next
                      })
                    }
                  >
                    <Star
                      className={
                        favorites.has(project.id)
                          ? "text-primary fill-current"
                          : "text-muted-foreground"
                      }
                    />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="gap-control-gap flex flex-wrap">
                <Badge variant="secondary" className="rounded-sm text-[10px]">
                  {t("library.projects.tracks", { count: project.tracks })}
                </Badge>
                <Badge variant="outline" className="rounded-sm text-[10px]">
                  {t("library.projects.tempo", { bpm: project.bpm })}
                </Badge>
              </CardContent>
              <CardFooter className="gap-control-gap justify-between rounded-none border-0 py-2">
                <span className="text-muted-foreground text-[11px]">
                  {t("library.projects.local")}
                </span>
                <Button
                  size="control"
                  variant={selected === project.id ? "default" : "secondary"}
                  aria-pressed={selected === project.id}
                  onClick={() => setSelected(project.id)}
                >
                  {t(
                    selected === project.id
                      ? "library.projects.selected"
                      : "library.projects.select"
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
        <p role="status" className="text-muted-foreground text-[11px]">
          {selected
            ? t("library.projects.selection", { name: t(`library.projects.${selected}`) })
            : t("library.projects.noSelection")}
        </p>
      </GallerySection>
    </>
  )
}

function ToolbarPreview({ profile }: { readonly profile: "default" | "transport" }) {
  const { t } = useTranslation()
  const [playing, setPlaying] = useState(false)
  const [recording, setRecording] = useState(false)
  const [bpm, setBpm] = useState(120)
  return (
    <div
      className={profile === "transport" ? "project-transport" : undefined}
      style={profile === "transport" ? { height: "auto", overflow: "visible" } : undefined}
    >
      <p className="text-muted-foreground mb-1 text-[11px]">{t(`library.toolbars.${profile}`)}</p>
      <div
        role="toolbar"
        aria-label={t(`library.toolbars.${profile}`)}
        className="gap-control-gap flex flex-wrap items-center"
      >
        <ControlGroup label={t("library.toolbars.playback")}>
          <DragPadToggle
            value={playing}
            onChange={setPlaying}
            label={t(playing ? "library.toolbars.pause" : "library.toolbars.play")}
            mappable={false}
            icon={playing ? <Pause /> : <Play />}
          />
          <Button
            variant="secondary"
            size="control-icon"
            aria-label={t("library.toolbars.stop")}
            onClick={() => {
              setPlaying(false)
              setRecording(false)
            }}
          >
            <Square />
          </Button>
          <DragPadToggle
            value={recording}
            onChange={setRecording}
            label={t("library.toolbars.record")}
            color="var(--destructive)"
            mappable={false}
            icon={<Circle className={recording ? "fill-current" : undefined} />}
          />
          <Button
            variant="secondary"
            size="control-icon"
            aria-label={t("library.actions.reset")}
            onClick={() => {
              setPlaying(false)
              setRecording(false)
              setBpm(120)
            }}
          >
            <RotateCcw />
          </Button>
        </ControlGroup>
        <DragPadNumber
          label={t("library.controls.bpm")}
          value={bpm}
          onChange={setBpm}
          min={20}
          max={999}
          step={0.01}
          defaultValue={120}
          format={value => value.toFixed(2)}
        />
        <Button variant="secondary" size="control" disabled>
          {t("library.toolbars.export")}
        </Button>
      </div>
      <p role="status" className="text-muted-foreground mt-1 text-[11px]">
        {t(playing ? "library.toolbars.playing" : "library.toolbars.stopped")} ·{" "}
        {t(recording ? "library.toolbars.armed" : "library.toolbars.safe")}
      </p>
    </div>
  )
}
