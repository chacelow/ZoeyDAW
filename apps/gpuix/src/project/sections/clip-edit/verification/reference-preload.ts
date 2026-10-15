import { execFileSync } from "node:child_process"
import path from "node:path"

const revision = process.env.CLIP_EDIT_REFERENCE
if (!revision || !/^[a-f0-9]{7,40}$/.test(revision))
  throw new Error("CLIP_EDIT_REFERENCE requires a commit SHA")
const git = Bun.which("git")
if (!git || !path.isAbsolute(git))
  throw new Error("A Git executable is required for reference replay")
const root = execFileSync(path.resolve(git), ["rev-parse", "--show-toplevel"], {
  cwd: import.meta.dir,
  encoding: "utf8",
}).trim()
Bun.plugin({
  name: "clip-editor-git-reference",
  setup(builder) {
    builder.onLoad(
      {
        filter:
          /\/clip-edit\/(midi\/(NoteGrid|VelocityLane|MidiEditor|useMidiEditor)|ClipEditor|NameInput)\.tsx?$/,
      },
      args => {
        let contents = execFileSync(
          path.resolve(git),
          ["show", `${revision}:${path.relative(root, args.path)}`],
          { cwd: root, encoding: "utf8" }
        )
        if (path.basename(args.path) === "ClipEditor.tsx") {
          if (
            !contents.includes("readonly clip: Clip") ||
            !contents.includes("export function ClipEditor(")
          )
            throw new Error(
              "Reference revision must contain the historical object-based ClipEditor"
            )
          contents = contents.replace(
            "export function ClipEditor(",
            "function ReferenceClipEditor("
          )
          // Replay the old public object boundary only in the reference run, never in product code.
          contents += [
            '\nexport function ClipEditor({clipId,trackId,...props}: Omit<ClipEditorProps,"clip"|"track"> & {clipId:string;trackId:string}) {',
            "const track=useProjectState(state=>state.document.tracks.find(item=>item.id===trackId));",
            "const clip=track?.clips.find(item=>item.id===clipId);",
            "return clip && track ? <ReferenceClipEditor {...props} clip={clip} track={track}/> : null;",
            "}\n",
          ].join("\n")
        }
        return { contents, loader: args.path.endsWith(".tsx") ? "tsx" : "ts" }
      }
    )
  },
})
