import catalog from "./library/en-US"

export default {
  catalog,
  knobs: {
    title: "Rotary controls",
    hint: "Drag vertically or wheel; click then type to edit. Arrows adjust, Home/End reach limits, double-click resets; Escape cancels editing.",
    cutoff: "Cutoff",
    pan: "Pan",
    mix: "Dry / Wet",
    gain: "Gain",
    compact: "Compact",
    transport: "Transport sizing",
    disabled: "Disabled",
    readOnly: "Read only",
    active: "Active highlight",
    noHighlight: "Hover highlight off",
    parse: "Strict numeric input",
    parseHint:
      "Type a number, then append letters: invalid drafts show an error and never publish. Escape restores the pre-edit value.",
  },
  meters: {
    title: "Calibrated level meters",
    hint: "Local deterministic signal only; no audio engine. Choose a scenario, stop to watch decay, or reset this demo. Meter surfaces never reset on click and do not drag or latch overload.",
    silence: "Silence",
    low: "Low signal",
    nominal: "Nominal",
    unity: "0 dB",
    overload: "Overload",
    play: "Start signal",
    stop: "Stop signal",
    reset: "Reset local signal and peaks",
    monoVertical: "Mono vertical",
    stereoVertical: "Stereo vertical",
    monoHorizontal: "Mono horizontal",
    stereoHorizontal: "Stereo horizontal",
    track: "Calibrated track appearance",
    peakHint: "Immediate peak rise · 600 ms hold · 24 dB/s decay. L/R are independent.",
    signal: "Current signal L / R",
    peak: "Peak L / R",
    motion: "Reduced motion uses steady signals; hidden pages pause their local clock.",
    status: "Local signal · Hold 600 ms · Decay 24 dB/s",
    localOnly: "Local simulation, not an audio engine.",
  },
  title: "Gallery",
  description:
    "Shared controls and live DAW views. Choose one component family on the left; exercise its real variants and inspect the state catalog.",
  navigation: "UI component families",
  isolation:
    "Sandbox: values, mapping and warnings stay in this Gallery and never change your project or audio engine. Demo playback and resource loading are local previews.",
  actions: {
    back: "Back to projects",
    settings: "Open settings",
    add: "Add",
    unavailable: "Unavailable action",
    reset: "Reset",
    retry: "Retry",
  },
  state: { on: "On", off: "Off", none: "None", disabled: "Disabled" },
  controls: {
    bpm: "BPM",
    position: "Position",
    volume: "Volume",
    send: "Send A",
    pan: "Pan",
    gain: "Gain",
    center: "C",
    left: "L",
    right: "R",
    link: "Link",
    mute: "Mute",
    solo: "Solo",
    decimal: "Default decimal",
    toggle: "Default toggle",
    muteShort: "M",
    soloShort: "S",
  },
  sections: {
    radio: {
      title: "RadioGroup",
      description: "Choose stereo or mono; disabled channels are skipped by keyboard navigation.",
    },
    "toggle-group": {
      title: "ToggleGroup",
      description:
        "Toggle Draw and Snap. Clicking the selected tool clears selection; disabled tools remain unavailable.",
    },
    toggle: {
      title: "Toggle",
      description: "Independent monitor on/off and a disabled icon toggle.",
    },
    popover: {
      title: "Popover",
      description:
        "Titled action content in default and above/end placements. Escape or outside interaction dismisses.",
    },
    numbers: {
      title: "DragPadNumber",
      description:
        "Drag vertically or use the wheel. Shift refines the step. Click to prepare text entry, type to edit, and double-click to reset.",
    },
    bars: {
      title: "DragPadBar",
      description:
        "Unipolar fill for volume, sends and wet/dry. The same shared drag, wheel and text-edit interactions apply.",
    },
    bipolar: {
      title: "DragPadBipolar",
      description: "A center-zero control for pan and gain. Changes stay live throughout the drag.",
    },
    sizing: {
      title: "Stable sizing",
      description:
        "The value range determines measured width, not the current text. Compare a decimal range and a three-digit range.",
    },
    toggles: {
      title: "DragPadToggle",
      description:
        "Click to toggle active state. Mute and Solo share the same sizing with semantic highlight colors.",
    },
    reset: {
      title: "Double-click reset",
      description:
        "These controls share the values above. Double-click to restore BPM 120, center pan and volume 75%.",
    },
    buttons: {
      title: "Buttons & states",
      description:
        "Shared compact variants, icon-only controls and disabled states. Click any enabled button to increment the counter.",
    },
    inputs: {
      title: "Inputs & validation",
      description:
        "Editable, valid, invalid and disabled fields. Enter at least three characters in the first field.",
    },
    choices: {
      title: "Radio & Toggle",
      description:
        "Keyboard-operable channel selection and tools. Toggle a tool off to leave the group unselected.",
    },
    tabs: {
      title: "MotionTabs & settings",
      description:
        "Switch content with the animated shared tabs. Open the existing settings dialog for theme and language.",
    },
    dropdowns: {
      title: "DropdownButton",
      description:
        "Root note, mode, grouped headings, separators and shortcut hints. Long menu descriptions retain their line breaks.",
    },
    alignment: {
      title: "Popup positioning",
      description:
        "Independent trigger-width menus aligned to the right, above or beside their trigger.",
    },
    popup: {
      title: "PopupButton",
      description:
        "Adjust pan and gain repeatedly without reopening. Compare below/start and above/end placements.",
    },
    context: {
      title: "Context menu",
      description:
        "Right-click the target or focus it and press Shift+F10. Use arrow keys and Enter to choose an action.",
    },
    mapping: {
      title: "Isolated mapping mode",
      description:
        "Enable Mapping here or in the header. All eligible Gallery controls pulse; click BPM or Pan to inspect a mapping target.",
    },
    warnings: {
      title: "Control information & warnings",
      description:
        "Hover a shared control for information. Push and dismiss local warnings without changing the project's status strip.",
    },
    list: {
      title: "Scrollable resource list",
      description:
        "Shared interactive row styling, active selection and a disabled resource. Selection follows keyboard focus.",
    },
    progress: {
      title: "Progress",
      description:
        "Advance a bounded value and reset it. At 100%, the advance action becomes unavailable.",
    },
    resourceStates: {
      title: "Loading, empty & error",
      description:
        "Retry transitions this local preview from error through Loading to ready. The empty selection is a separate state.",
    },
    toast: {
      title: "Toast feedback",
      description:
        "Show success and error messages. Start a persistent loading toast, then finish that same notification.",
    },
    dragPreview: {
      title: "Drag preview",
      description:
        "Drag the sample to see the shared floating preview. Release to return it, or press Escape to cancel. No project drop occurs.",
    },
    toolbars: {
      title: "Default vs Transport",
      description:
        "The same composition inherits the shared default or Transport sizing profile. Buttons only control the local preview.",
    },
    projects: {
      title: "Project card hierarchy",
      description:
        "Project titles, descriptions, metadata and actions form a separate content hierarchy—not another framed panel.",
    },
  },
  buttons: {
    default: "Default",
    outline: "Outline",
    ghost: "Ghost",
    secondary: "Secondary",
    destructive: "Destructive",
    link: "Link",
    activations: "Activations",
  },
  inputs: {
    editable: "Project name",
    placeholder: "Enter a project name",
    help: "Use at least three characters.",
    valid: "Valid project name.",
    invalid: "Invalid example",
    invalidValue: "?",
    error: "This name is unavailable.",
    validLabel: "Valid example",
    validValue: "Evening session",
    disabledValue: "Read-only device",
  },
  forms: {
    channels: "Channels",
    stereo: "Stereo",
    mono: "Mono",
    unavailable: "Unavailable",
    tools: "Tools",
    draw: "Draw",
    snap: "Snap",
    monitor: "Monitor",
    clips: "Clips",
    devices: "Devices",
    routing: "Routing",
    clipContent: "Clip editor content is selected.",
    deviceContent: "Device chain content is selected.",
    routingContent: "Input and output routing content is selected.",
  },
  menus: {
    scale: "Root note",
    rootNote: "The project's root note",
    mode: "Mode",
    modeHint: "Scale type used by the project",
    major: "Major",
    minor: "Minor",
    dorian: "Dorian",
    grouped: "Grouped menu",
    common: "Common",
    other: "Other modes",
    longDorian: "Dorian — minor with a raised sixth\nFor vintage rock and jazz transitions",
    alignRight: "Right aligned",
    above: "Open above",
    rightSide: "Open beside",
    mixer: "Mini mixer",
    mixerHint: "Adjust pan and gain in one popup",
    popover: "Popover",
    popoverTitle: "Clip inspector",
    popoverHint: "Popovers can contain explanations and actions, not just menu items.",
    inspect: "Inspect sample",
    contextTarget: "Right-click here · Shift+F10",
    clipActions: "Clip actions",
    duplicate: "Duplicate",
    rename: "Rename",
    deleteUnavailable: "Delete (unavailable)",
    actions: {
      none: "No action selected.",
      inspected: "Sample inspected.",
      duplicated: "Duplicate action selected.",
      renamed: "Rename action selected.",
    },
  },
  menuOptions: {
    snap: "Snap to grid",
    clipType: "Clip type",
    audio: "Audio",
    midi: "MIDI",
    color: "Preview accent",
    warm: "Accent 1",
    cool: "Accent 2",
  },
  mapping: { label: "Mapping", on: "Mapping on", off: "Mapping off" },
  warnings: {
    pushWarning: "Push warning",
    pushError: "Push error",
    pushInfo: "Push info",
    clear: "Clear all",
    noAudio: "No audio output device detected",
    missingSample: "Missing sample: kick-909.wav",
    saved: "Draft saved automatically",
    controlInfo: "Control: {{info}}",
    latest: "Latest warning: {{message}}",
    count: "{{count}} warnings",
    dismiss: "Dismiss: {{message}}",
  },
  list: {
    label: "Sample resources",
    kick: "Kick 909.wav",
    snare: "Snare Rimshot.wav",
    hat: "Hat Closed.wav",
    clap: "Clap Analog.wav",
    unavailable: "Offline sample (unavailable)",
    sample: "Sample {{number}}.wav",
    keyboard: "↑ ↓ select · Home / End jump · disabled rows are skipped",
  },
  feedback: {
    progress: "Demo progress",
    advance: "+10%",
    errorTitle: "Could not open the resource",
    errorHint:
      "This is a local error-state preview. Retry to exercise the loading and ready states.",
    loading: "Loading demo resources…",
    ready: "Resource ready",
    readyHint: "The retry completed. You can return to the error state and repeat it.",
    showError: "Show error again",
    emptyTitle: "No clips selected",
    emptyHint: "Select a clip in a project to inspect its details.",
    success: "Operation completed",
    successLabel: "Success toast",
    loadingLabel: "Loading toast",
    finish: "Finish loading",
    errorLabel: "Error toast",
  },
  drag: {
    unavailable: "Drop unavailable",
    sample: "Sample preview.wav",
    idle: "Drag the sample to begin.",
    dragging: "Preview active · Escape cancels",
    released: "Preview released; source restored.",
    cancelled: "Preview cancelled; source restored.",
  },
  projects: {
    session: "Evening session",
    sessionHint: "A full arrangement with audio and MIDI tracks.",
    sketch: "Rhythm sketch",
    sketchHint: "A small idea ready for the next recording.",
    favorite: "Toggle favorite",
    tracks: "{{count}} tracks",
    tempo: "{{bpm}} BPM",
    local: "Local project",
    selected: "Selected",
    select: "Select",
    selection: "Selected project: {{name}}",
    noSelection: "No project selected.",
  },
  toolbars: {
    default: "Default · compact controls",
    transport: "Transport · shared larger profile",
    playback: "Demo playback",
    play: "Play preview",
    pause: "Pause preview",
    stop: "Stop preview",
    record: "Arm recording preview",
    export: "Export unavailable",
    playing: "Playing preview",
    stopped: "Stopped",
    armed: "Record armed",
    safe: "Record off",
  },
}
