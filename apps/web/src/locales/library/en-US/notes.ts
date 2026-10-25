export default {
  audioEmpty:
    "Choose Empty waveform in the clip picker; it has no peaks and shows the production empty waveform surface, not a load failure.",
  pianoEmpty:
    "Choose Empty MIDI or All steps off; production editors show actual no-note/no-active-step content.",
  numericReadonly:
    "The read-only specimen keeps its value and focus but blocks drag, wheel and keyboard adjustment; text entry is also disabled. It is not a disabled control.",
  knobActive:
    "The actual rotary active specimen uses shared active state independently from hover; the no-highlight specimen disables hover without disabling adjustment.",
  knobInvalid:
    "The strict numeric parser specimen exposes an actual invalid draft/error surface. Append letters after a numeric draft; it does not publish and Escape restores the starting value.",
  button: "Enabled buttons respond to activation; the counter records the basic specimens.",
  buttonHover:
    "Pointer entry starts immediately, with no hover delay or leave timer. Shared CSS transition uses the theme duration; transport icons scale over 150 ms and return on leave.",
  keyboard:
    "Use Tab / Shift+Tab to focus the actual enabled controls; browser/shared focus styles remain in effect.",
  buttonPress:
    "Hold the primary pointer button to exercise the actual pressed styling; release activates. Disabled controls do not activate.",
  disabled: "A real disabled specimen cannot change its value or receive normal activation.",
  numeric:
    "Displayed values come from local controlled state; decimal/position formatting and stable width use the production control.",
  controlHover:
    "Entry is immediate, with no hover delay or leave timer. Shared color transitions follow theme CSS; leave restores the non-hover surface. Wheel adjustment keeps the cursor visible.",
  numericPress:
    "Click prepares text entry; moving beyond the shared threshold begins a real drag instead.",
  mapping:
    "Use the header Mapping switch; eligible enabled controls receive the shared mapping overlay independently from value or selection.",
  preedit:
    "Click an editable control once: the real control enters its highlighted pre-edit state. Type a number to start text entry.",
  editing:
    "Type after clicking. Text input keeps its icon; valid numeric changes publish live. Enter/blur finishes and Escape cancels.",
  numericValid:
    "Enter a finite numeric value; the shared parser clamps and quantizes it within the configured range.",
  numericInvalid:
    "An empty or nonnumeric draft does not publish a numeric value. Basic pads do not expose a separate validation-error surface; the knob strict-parser specimen does.",
  numericDrag:
    "Drag vertically for live updates; Shift refines adjustment. Cursor hiding/locking follows the shared host interaction bridge, not a second demo engine.",
  numericCommit:
    "Release a drag or press Enter/blur during entry. Double-click restores the configured default.",
  numericCancel:
    "Escape cancels text entry or an active shared drag and restores its gesture start value.",
  toggle: "Real boolean controlled values render on/off labels or icons.",
  toggleActive:
    "Click or activate by keyboard to switch the actual selected value and semantic active color.",
  fader:
    "Displayed dB and thumb position share the same local value; horizontal and vertical faders are separate specimens.",
  faderHover:
    "The pointer cursor applies immediately; there is no timed hover or delayed leave, and no separate hover highlight contract.",
  faderPress:
    "Pointer-down on the track jumps to that level; pressing the thumb starts adjustment from its current value.",
  faderDrag:
    "Drag in the fader orientation. Values update live by pointer distance; Shift applies finer adjustment.",
  faderCommit:
    "Release commits the live value; double-click resets to unity. The external Reset button resets both specimens.",
  faderCancel:
    "Pointer cancellation or lost capture restores the starting value. The fader does not implement Escape cancellation.",
  meter:
    "Choose silence/low/nominal/unity/overload on the external signal controls. These are local display inputs, not an audio-engine connection.",
  meterReadonly:
    "Meter surfaces are display-only: no focus, press, drag, click-reset, disabled appearance or latched overload. Signal/peak reset belongs to the external demo control.",
  input: "Compare the separate editable, read-only and disabled input elements.",
  inputHover:
    "No application hover delay or leave timer; the input retains its own shared border/background styles.",
  readonly:
    "Read-only is a real readOnly input, still focusable and selectable; it is not disabled.",
  inputEdit: "Type in the first field; local state and the associated help message update live.",
  inputValid:
    "Three or more non-whitespace characters make the first field valid; a separate valid specimen is always visible.",
  inputInvalid:
    "One or two characters mark the first field aria-invalid; the separate invalid specimen includes an associated error message.",
  inputEmpty: "Clear the first field to see the empty placeholder and neutral help.",
  choice:
    "Radio choices, single-selection tool toggles and independent monitor toggles use their actual shared primitives.",
  choiceHover:
    "Immediate pointer highlight; no application hover delay or leave timer. Shared CSS transitions remain in effect.",
  choiceKeyboard:
    "Tab enters each control group; use arrow keys in radio/toggle groups and keyboard activation for the independent toggle.",
  choiceActive:
    "Change the channel or tool; clicking the chosen tool may leave the group with no selection. Monitor is an independent boolean.",
  tabs: "Content panels are actual MotionTabs children, not image replacements.",
  tabsHover:
    "Immediate onset; leave removes hover. Reference: 160 ms ease-out. Current MotionTabs: spring stiffness 500 / damping 30, not a fixed-duration transition.",
  tabsKeyboard:
    "Tab/Shift+Tab focuses the native buttons; Enter/Space activates. Current MotionTabs does not implement Arrow/Home/End navigation; the Gallery sidebar does.",
  tabsActive:
    "Select a tab to change both indicator and visible content. Settings opens the existing full dialog.",
  menu: "Activate a trigger to open the real shared popup/menu. Closed and open states are controlled by the component.",
  menuHover:
    "Trigger/item response begins immediately without a hover delay or leave timer. Nested menu entry uses the menu primitive, not a Gallery timer.",
  menuKeyboard:
    "Tab focuses triggers. Activate with Enter/Space; menu items use arrows and Escape closes. Popover content uses ordinary focusable controls.",
  menuActive:
    "Expanded triggers and selected items are real component state; interactive popup adjustments keep their panel open.",
  menuCommit:
    "Choose an enabled item/action. A persistent adjustment popup keeps its changes live without closing on each adjustment.",
  menuCancel:
    "Escape or outside dismissal closes the popup; dismissal does not roll back already applied control values.",
  context: "Right-click the target, or focus it and press Shift+F10 / Context Menu.",
  contextActive:
    "Checkbox, radio and nested color selections update their real values; checkmarks reflect those selections.",
  command: "The shared Command component owns keyboard selection and filters actual commands.",
  commandHover:
    "Pointer entry immediately selects an enabled item; no Gallery hover delay or leave timer.",
  commandKeyboard: "Focus search, use arrows to navigate and Enter to select the command.",
  commandActive: "The command primitive highlights the real selected search result.",
  commandEdit: "Type a query; the shared component filters command labels.",
  commandEmpty: "Enter a query with no matching label to display CommandEmpty.",
  commandCommit:
    "Choose an enabled command; the status below records the local action only, with no playback engine.",
  list: "Selectable sample rows use shared rowInteractiveClasses inside a real ScrollArea.",
  listHover:
    "Immediate shared row highlight without application delay or leave timer; leaving restores selected/unselected styling.",
  listKeyboard:
    "ArrowUp/Down, Home/End move selection and roving focus, scroll into view and skip the disabled row.",
  listActive:
    "Click an enabled row or use navigation keys; selection is retained when switching component pages.",
  feedback:
    "Progress, resource screens and toast controls are real shared components with local-only state.",
  feedbackDisabled:
    "Progress advance disables at 100%; Finish loading disables until a loading toast exists.",
  feedbackLoading:
    "Retry shows Loading for 900 ms before ready. Loading toast remains pending until Finish. Leaving this family cancels its timer and pending toast.",
  feedbackEmpty: "The actual Empty component is always available beside resource states.",
  feedbackError:
    "Initial resource error renders LoadErrorScreen with a retry action; Error toast is a separate notification specimen.",
  feedbackRetry: "Retry transitions error → loading → ready. Show error again repeats the cycle.",
  card: "Actual Card header/content/footer/action slots and Badge variants compose each local project card.",
  cardHover:
    "Only the actionable buttons have their shared immediate hover transitions; the card itself has no invented hover state or leave timer.",
  cardActive:
    "Select changes the actual selection; the star independently toggles its actual favorite state.",
  toolbar:
    "Two real metric profiles share the same components and local playback/record/BPM state. No audio playback is started.",
  toolbarActive:
    "Play and record toggles keep independent active values. Stop/reset clears them; BPM remains a real editable control.",
  layout:
    "Actual nested ResizablePanelGroups lay out three labeled regions; the colored surfaces are region backgrounds, not fake DAW screenshots.",
  layoutHover:
    "Separator cursor appears on entry immediately; there is no Gallery hover highlight duration or leave timer.",
  layoutKeyboard: "Focus a separator and use the resize library’s arrow-key interaction.",
  layoutDrag:
    "Drag horizontal or vertical separator; actual panel geometry updates with minimum-size constraints.",
  layoutCommit: "Release retains the new panel proportions in this mounted layout demo.",
  drag: "The shared DragPreviewArea renders a floating file preview when its source is dragged.",
  dragHover:
    "Source cursor switches immediately to grab; no delayed hover or leave animation is added.",
  dragPreview:
    "Drag the source: the actual shared floating preview appears and source-active attributes drive the visible status.",
  dragCancel: "Escape, pointer cancellation or blur removes the preview and restores the source.",
  dragCommit:
    "Pointer release removes the preview and restores the source. This demo does not import or commit any project file.",
  buttonActive:
    "The active-button specimen uses actual boolean state and shared active classes; toggle the neighboring hover switch independently.",
  warning: "Push info, warning or error messages into this Gallery’s local interaction store.",
  warningDisabled: "Clear all is disabled while no messages exist.",
  warningEmpty: "Clear all removes all messages and displays the empty count.",
  warningError: "Push error adds an actual local error-severity warning, not a backend failure.",
  mappingIdle: "Mapping begins off and only affects this Gallery interaction provider.",
  mappingActive:
    "Toggle the real Mapping switch and inspect its eligible numeric, bar and toggle targets below.",
  dawKeyboard:
    "Use the production controls’ focus and keyboard behavior inside the frame. Keyboard shortcuts stay in that isolated project; snapshots and navigation are disabled.",
  dawCommit:
    "Release a production gesture or finish its editor. Changes belong only to this frame’s project; Reset sample restores the seeded scenario.",
  dawCancel:
    "Use Escape/blur for the production gesture paths that support cancellation; already committed edits use the production undo behavior.",
  tracksIdle:
    "The seeded production timeline contains audio, MIDI, return and main tracks alongside groups.",
  tracksHover:
    "Header controls highlight immediately with no Gallery delay/leave timer. Track-resize handles show only their resize cursor; production timeline hover hit regions remain intact.",
  tracksPressed:
    "Press a track selection surface or a real mixer/routing control; the operations-bar selection remains independent.",
  tracksSelected:
    "Select tracks from the preview picker or actual track surfaces; selection and header operations use the production session state.",
  tracksDisabled:
    "Arm: audio/MIDI only. Main mute/solo are unavailable. Routing and send availability use each actual track kind.",
  tracksEdit:
    "Rename inline in the real header or edit production controls. Names accept arbitrary text including blank; there is no invented valid/invalid rename state.",
  tracksDrag:
    "Use real track reorder/height handles and timeline gestures. Expanded and folded geometry follows production behavior.",
  tracksDrop:
    "Track reorder uses production drop zones and kind/group constraints; external file drops are not part of this preview.",
  tracksEmpty:
    "Type a search with no matching track/clip in the preview picker; the real no-results message appears without mutating the seeded project.",
  groupsIdle:
    "Three seeded groups include nested drums within an ensemble plus an independent synth group, with multiple actual children.",
  groupsDisabled:
    "Groups are not record-arm targets. Routing and valid nesting use production constraints, not a new demo-only rule.",
  groupsDrag:
    "Reorder real group tracks or resize them; collapsed summaries and child visibility are production views.",
  groupsDrop:
    "Production group drop zones apply nesting and cycle constraints during track reorder.",
  clipsIdle:
    "Actual production audio/MIDI cards render in TimelineCanvas, with deterministic local content.",
  clipsHover:
    "Hover real card titles, edges and content to expose production hit regions. No Gallery hover timer or forced pseudo-state is added.",
  clipsPressed:
    "Press titles or content to exercise the production selection/playback-position distinction. No audio engine is started.",
  clipsSelected:
    "Actual clip selection follows production timeline behavior; the picker can select deterministic clips too.",
  clipsEdit:
    "Use the production title and selected-clip controls; inline names allow blank text without a validation-error state.",
  clipsDrag:
    "Drag actual cards or their edges to move/trim; audio fade anchors use their real production gesture paths.",
  clipsDrop:
    "Dropping a moved card commits its production timeline placement. This is not a file-import target.",
  audioIdle:
    "The actual selected audio clip editor displays deterministic source data, markers and loop parameters.",
  audioHover:
    "Hover editor controls, marker/fade handles and waveform hit regions. There is no extra Gallery onset delay or leave timer.",
  audioSelected:
    "The selected audio clip determines the real editor and its owning track/title color.",
  audioDisabled:
    "Turn Warp off: the production Warp-mode dropdown becomes disabled. Record arm also follows the selected track kind.",
  audioEdit:
    "Edit actual start/end/loop and audio parameters with shared controls; no separate fake waveform editor is used.",
  audioDrag:
    "Drag real marker/loop/fade handles or the production timeline audio card; valid handle constraints remain active.",
  pianoIdle:
    "The production MIDI editor owns actual keyboard, note and velocity views, plus selectable deterministic pattern content.",
  pianoHover:
    "Hover keys, note bodies/edges and velocity bars to expose production cursors. No Gallery hover delay or leave timer is added.",
  pianoKeyboard:
    "Use the MIDI editor’s production selection, edit, delete and undo shortcuts; input focus retains ordinary text handling.",
  pianoPressed:
    "Press keys or note-grid cells to exercise real visual key/note state. This preview does not produce audio.",
  pianoSelected:
    "Select actual notes or another MIDI/pattern clip. Selection uses the isolated production store.",
  pianoEdit:
    "Draw, move, resize and delete notes; edit velocities and real pattern steps. Production undo remains available.",
  pianoDrag:
    "Actual note move/resize, velocity and viewport drag paths run inside the production editor.",
  automationIdle:
    "Authored volume and pan parameter lanes are seeded in the actual production automation view.",
  automationHover:
    "Hover real points, curves and lane hit regions; production cues appear immediately with no added Gallery timer.",
  automationSelected:
    "Select production automation points/regions. Mapping-target highlighting is a separate shared overlay toggle.",
  automationEdit: "Use the actual selected-point value editor and production automation actions.",
  automationDrag:
    "Move actual points or curve handles; release/cancel follows production automation gesture ownership.",
  devicesIdle:
    "The real EffectChain renders deterministic device metadata and actual parameter controls; it does not host plugins or DSP.",
  devicesHover:
    "Production device/header/parameter hover styles apply immediately without an added Gallery delay or leave timer.",
  devicesKeyboard:
    "Use actual device-chain focus, selection, delete and reorder keyboard behavior inside the frame.",
  devicesSelected:
    "Select a real device; its parameter editor and selection surface follow production state.",
  devicesDisabled:
    "Use actual bypass/enable controls. Bypassed device parameters remain governed by production behavior; bypass does not claim a disabled HTML input or running DSP.",
  devicesEdit:
    "Adjust actual device parameters and add/remove devices using the production chain UI.",
  devicesDrag: "Drag real device cards for production reordering.",
  devicesDrop:
    "Production device reorder targets accept device cards; there is no plugin-file import or installer.",
  devicesEmpty:
    "Remove devices to reach the production empty-chain view; adding devices restores content.",
  editorIdle:
    "Selection determines exactly one actual audio/MIDI/pattern detail editor rather than showing simultaneous fake modes.",
  editorHover:
    "Hover the active editor’s real controls and hit regions. Timing belongs to that production component; Gallery adds no delayed hover/leave behavior.",
  editorSelected:
    "Choose a track and clip. The actual current clip identity determines editor kind, title and owning color.",
  editorEdit:
    "Rename/recolor the selected clip or edit its real audio/MIDI parameters. The same production store drives arrangement and detail.",
  editorDrag:
    "Use the active editor’s actual marker, note, velocity or viewport gestures; changing clip kind switches the production editor.",
  editorEmpty:
    "Select a track without clip content to exercise the production no-selected-clip detail view.",
  dawNaValidation:
    "Inline names allow arbitrary text including blank and do not expose valid/invalid styling. Numeric editors keep their own parser behavior; no synthetic rename error is added.",
  dawNaResource:
    "The isolated deterministic project does not simulate backend/resource failures or retry. Initialization may briefly mount a loading message; it is not an interactive failure scenario.",
  automationNaDrop:
    "Point movement and mapping target highlighting are available, but drag-to-bind mapping is not connected. No drop-target binding claim is made.",
  "na-idle": "No independent idle state is exposed by this family.",
  "na-hover":
    "This display-only surface has no hover interaction or timing. Use its external scenario controls instead.",
  "na-focus": "The surface is not a keyboard-focusable control; use the external demo controls.",
  "na-pressed": "This family has no separate pressed/activation state.",
  "na-active":
    "No persistent selected/active value is exposed for this family. Hover and mapping, where present, are separate states.",
  "na-disabled":
    "No disabled API/specimen belongs to this surface. Do not confuse display-only with disabled.",
  "na-readonly":
    "This family has no independent read-only variant; disabled or non-text-editable variants are not substitutes.",
  "na-preedit": "No numeric pre-edit phase belongs to this family.",
  "na-editing": "No text/value editing surface belongs to this family.",
  "na-valid": "This family does not validate user input or display a valid-result state.",
  "na-invalid":
    "This family does not expose a validation-error state. Disabled items and resource errors are different concepts.",
  "na-dragging": "This family does not implement pointer dragging.",
  "na-dropTarget":
    "This demo is not a receiving drop target. Pointer dragging/adjustment is not a drop operation.",
  "na-commit": "No separate commit/release lifecycle is exposed beyond ordinary activation.",
  "na-cancel": "No reversible gesture or explicit cancellation contract belongs to this family.",
  "na-loading": "This family has no asynchronous resource loading.",
  "na-empty": "This family does not present a collection/resource empty state.",
  "na-error":
    "This family has no resource failure state; input validation is listed separately where applicable.",
  "na-retry": "This family has no failed resource operation to retry.",
}
