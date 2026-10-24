export default {
  catalog: {
    stateTitle: "State checklist",
    stateHint:
      "Use the actual specimens above. Supported means implemented in the current component/demo; N/A explains a state that is not part of this family. Transient states require the listed interaction.",
    evidence:
      "Source basis: current shared components and production views. Reference timing is noted where observed; local signal/loading scenarios are Gallery extensions. This catalog does not assert browser verification or an audio-engine connection.",
    stateColumn: "State",
    supportColumn: "Applicability",
    exerciseColumn: "How to exercise / limits",
    supported: "Supported",
    na: "Not applicable",
    variants: "Visible variants",
    previewHint:
      "Live production components in an isolated frame. Edits stay in the seeded preview; leaving or changing theme/language resets this frame. No engine, file saving or project mutation.",
    localPreview: "Isolated local preview",
    probe: {
      label: "Specimen-region event:",
      hint: "Observed browser input, not a forced component state.",
      idle: "none",
      enter: "pointer entered (immediate onset)",
      leave: "pointer left; observed dwell",
      focus: "focus entered a real control",
      blur: "focus left a control",
      down: "pointer pressed",
      up: "pointer released",
      cancel: "pointer cancelled",
      input: "actual input changed",
      wheel: "wheel input",
    },
    groups: {
      controls: "Controls",
      navigation: "Navigation & composition",
      feedback: "Feedback & interaction",
      daw: "DAW production components",
    },
    families: {
      radio: {
        title: "Radio",
        description:
          "Production RadioGroup with selected, unselected and disabled channel options; arrow keys move selection.",
      },
      "toggle-group": {
        title: "ToggleGroup",
        description:
          "Production tool ToggleGroup with real selected, unselected, deselected and disabled options.",
      },
      toggle: {
        title: "Toggle",
        description:
          "Independent real icon Toggle, plus an unavailable specimen; switch its pressed value with pointer or keyboard.",
      },
      buttons: {
        title: "Button",
        description:
          "Six semantic styles, compact and transport sizes, icons, activation and independent hover highlighting.",
      },
      numbers: {
        title: "Number",
        description:
          "Decimal tempo, musical position and measured stable widths. Compare compact, icon, non-text-editable and disabled controls.",
      },
      bars: {
        title: "Bar",
        description:
          "Unipolar volume and send fills with shared dragging, wheel, text entry and reset.",
      },
      bipolar: {
        title: "Bipolar",
        description:
          "Center-zero pan and gain. Watch values and fills update together throughout gestures.",
      },
      toggles: {
        title: "Toggle pad",
        description:
          "Link, mute and solo with real on/off states, semantic colors and square icon controls.",
      },
      pan: {
        title: "Pan",
        description:
          "Production PanControl: center, left and right formatting with parsing and center reset.",
      },
      knobs: {
        title: "Knobs",
        description:
          "Real shared rotary controls; all adjustments use the same drag, wheel and inline-edit behavior as numeric pads.",
      },
      meters: {
        title: "Meters",
        description:
          "Mono/stereo and vertical/horizontal calibrated meters. Local signal scenarios expose independent channel peaks and ballistics.",
      },
      faders: {
        title: "Faders",
        description:
          "Actual VolumeFader in both orientations. Pointer position sets level; double-click restores unity.",
      },
      inputs: {
        title: "Inputs",
        description:
          "Editable, valid, invalid, empty, disabled and read-only fields, with associated help and error messages.",
      },
      tabs: {
        title: "Tabs",
        description:
          "Real animated content tabs and the existing full application settings dialog.",
      },
      dropdowns: {
        title: "Dropdown",
        description:
          "Root-note and grouped mode selectors with shortcuts, multiline labels and placement variants.",
      },
      popup: {
        title: "Popup",
        description:
          "Persistent adjustment popups: repeated drag and wheel changes do not dismiss the panel.",
      },
      popover: {
        title: "Popover",
        description:
          "Accessible titled popovers with real action controls and alternate placement.",
      },
      context: {
        title: "Context menu",
        description:
          "Actions, disabled items, checkbox/radio selection and nested color menus. Open with right-click or Shift+F10.",
      },
      command: {
        title: "Command menu",
        description:
          "Search and keyboard-select local commands; unmatched searches show the actual empty result component.",
      },
      list: {
        title: "Lists · Scroll",
        description:
          "Shared selectable rows inside ScrollArea with disabled rows, roving focus and preserved selection.",
      },
      feedback: {
        title: "Feedback",
        description:
          "Progress, real loading/empty/error screens, retry and toast lifecycle controls. Effects stop when leaving this page.",
      },
      warnings: {
        title: "Warnings",
        description:
          "Local info, warning and error messages with individual dismissal and clear-all.",
      },
      mapping: {
        title: "Mapping",
        description:
          "Actual mapping mode and mappable targets; enabling mapping uses the shared overlay, not a painted demo state.",
      },
      dragPreview: {
        title: "Drag preview",
        description:
          "Shared pointer drag preview with source restoration and observable release/cancel status. This example has no receiving drop target.",
      },
      projects: {
        title: "Cards · Badges",
        description:
          "Project cards with real selection and favorite actions, metadata badges and full card composition.",
      },
      toolbars: {
        title: "Toolbar · ControlGroup",
        description:
          "Default and transport profiles with local playback/record states, tempo entry and joined separators.",
      },
      layout: {
        title: "Layout",
        description:
          "Nested real resizable panels, handles and separators. These are layout primitives, not a second DAW implementation.",
      },
      tracks: {
        title: "Tracks",
        description:
          "Isolated production audio, MIDI, return and main tracks; compare expanded/collapsed views and routing/mixer constraints.",
      },
      groups: {
        title: "Groups",
        description:
          "Production nested groups with multiple children; collapse/expand and inspect independent track selection.",
      },
      clips: {
        title: "Clips",
        description:
          "Real audio and MIDI arrangement cards in the production timeline with selection, movement and resizing.",
      },
      audio: {
        title: "Audio editor",
        description:
          "Production audio clip detail: source display, markers, loop and fades, linked to the selected arrangement clip.",
      },
      "piano-roll": {
        title: "Piano roll",
        description:
          "Production MIDI clip detail with keyboard, notes, velocity, selection and note editing.",
      },
      automation: {
        title: "Automation",
        description:
          "Production timeline automation with real parameter lanes and point editing in its isolated project.",
      },
      devices: {
        title: "Devices",
        description:
          "Production device chain with selection, enable state and actual editable device parameters.",
      },
      "track-editor": {
        title: "Selected-track clip editor",
        description:
          "Select audio or MIDI content and inspect exactly one production clip editor at a time.",
      },
    },
    variantsList: {
      buttonStyles: "Default · outline · ghost · secondary · destructive · link",
      buttonSizes: "Default · compact · transport sizes",
      buttonIcons: "Text · leading icon · square icon-only",
      buttonColors: "Active · semantic colors · hover highlight toggle",
      numberDecimal: "Two-decimal tempo",
      numberPosition: "Musical position",
      numberSizing: "Stable measured range widths",
      controlStates: "Default · compact · transport · disabled · read-only · non-text-editable",
      toggleSizes: "Text · compact icon · disabled",
      panDisabled: "Default · compact · disabled",
      choiceDisabled: "Selected · unselected · disabled",
      barVolume: "Volume fill",
      barSend: "Colored send fill",
      bipolarPan: "Center-zero pan",
      bipolarGain: "Signed gain",
      toggleLink: "Link on/off",
      toggleMute: "Mute semantic color",
      toggleSolo: "Solo semantic color",
      panCenter: "Center reset",
      panStereo: "Left/right parsing · compact",
      knobUnipolar: "Unipolar rotary controls",
      knobBipolar: "Bipolar rotary controls",
      meterChannels: "Mono · stereo",
      meterOrientation: "Horizontal · vertical · track appearance",
      meterLevels: "Silence · negative · unity · overload",
      meterBallistics: "Immediate rise · 600 ms hold · 24 dB/s decay",
      faderHorizontal: "Horizontal fader",
      faderVertical: "Vertical fader",
      faderDisabled: "Disabled · double-click reset",
      inputStates: "Editable · empty · read-only · disabled",
      inputValidation: "Valid · invalid with associated message",
      choiceRadio: "RadioGroup channels",
      choiceToggle: "Standalone icon Toggle",
      choiceGroup: "Deselectable ToggleGroup",
      tabsContent: "Three real content panels",
      tabsSettings: "Full settings dialog",
      dropdownGrouped: "Grouped items · shortcuts · multiline",
      dropdownPlacement: "Start · end · above · right",
      popupControls: "Persistent mixer adjustments",
      popoverAction: "Titled action popover · placement",
      contextItems: "Action · disabled · checkbox · radio",
      contextSubmenu: "Nested color submenu",
      commandSearch: "Search · keyboard activation",
      commandEmpty: "No-results · disabled command",
      listSelection: "Selected · unselected · disabled rows",
      listScroll: "ScrollArea · roving keyboard focus",
      feedbackProgress: "Progress 0–100%",
      feedbackResource: "Error → loading → ready · empty",
      feedbackToast: "Success · loading → success · error",
      warningSeverity: "Info · warning · error",
      warningDismiss: "Dismiss one · clear all",
      mappingState: "Mapping off/on",
      mappingTarget: "Real eligible controls",
      dragSource: "Floating shared preview",
      dragCancel: "Pointer release · Escape cancellation",
      cardSelection: "Selected/unselected card",
      cardFavorite: "Favorite on/off",
      cardBadge: "Secondary/outline metadata badges",
      toolbarDefault: "Default shared metric profile",
      toolbarTransport: "Transport profile · joined separators",
      layoutSplit: "Horizontal/vertical nested panels",
      layoutSeparator: "Resizable handles · separators",
      "daw-tracks": "Audio · MIDI · return · main; expand/collapse",
      "daw-groups": "Multiple/nested groups; expand/collapse",
      "daw-clips": "Audio · MIDI cards; selection and arrangement edits",
      "daw-audio": "Audio detail · markers · loop · fades",
      "daw-piano-roll": "Piano keys · notes · velocity editor",
      "daw-automation": "Parameter lanes · automation points",
      "daw-devices": "Device chain · enabled/disabled devices · parameters",
      "daw-track-editor": "Selected audio or MIDI editor; synchronized title/color",
    },
    states: {
      idle: "Idle / default",
      hover: "Hover · onset / duration / leave",
      focus: "Focus-visible",
      pressed: "Pressed",
      active: "Active / selected / highlight",
      disabled: "Disabled",
      readonly: "Read-only",
      preedit: "Pre-edit",
      editing: "Editing",
      valid: "Valid",
      invalid: "Invalid",
      dragging: "Dragging",
      dropTarget: "Drop target",
      commit: "Commit / release",
      cancel: "Cancel",
      loading: "Loading",
      empty: "Empty",
      error: "Error",
      retry: "Retry",
    },
    demo: {
      panCenter: "Center",
      panLeft: "Left · compact",
      panRight: "Right",
      panHint:
        "Drag or wheel; click then type a signed value. Double-click centers. L/R/C formatting comes from the real PanControl.",
      horizontal: "Horizontal",
      vertical: "Vertical",
      faderHint:
        "Drag either orientation or click its track; Shift refines the step. Arrow keys adjust, Home/End reach limits; double-click resets to 0 dB. Pointer cancellation restores the start value; Escape is not a fader cancellation shortcut.",
      commandLabel: "Local command palette",
      commandSearch: "Search commands…",
      commandEmpty: "No matching commands",
      commandGroup: "Local actions",
      "command-play": "Select play preview",
      "command-stop": "Select stop preview",
      "command-reset": "Select reset preview",
      layoutBrowser: "Browser region",
      layoutArrangement: "Arrangement region",
      layoutDetail: "Detail region",
      layoutResize: "Resize adjacent panels",
      layoutHint:
        "Drag either separator, or focus its handle and use arrow keys. Each panel keeps its minimum size.",
      "size-default": "Default",
      "size-xs": "Extra small",
      "size-sm": "Small",
      "size-lg": "Large",
      "size-control": "Compact control",
      activeButton: "Active button",
      highlightOn: "Hover highlight on",
      highlightOff: "Hover highlight off",
      compact: "Compact with icon",
      noTextEdit: "Text entry off",
      numericHint:
        "Compare compact/icon and transport controls, text-entry-disabled (drag/wheel still work), read-only and disabled specimens. Double-click enabled controls to reset.",
      transport: "Transport profile with icon",
      "separator-none": "Joined · no separator",
      "separator-slash": "Joined · slash",
      "separator-dot": "Joined · dot",
      "separator-line": "Joined · line",
    },
    notes: {
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
      inputEdit:
        "Type in the first field; local state and the associated help message update live.",
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
      feedbackRetry:
        "Retry transitions error → loading → ready. Show error again repeats the cycle.",
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
      dragCancel:
        "Escape, pointer cancellation or blur removes the preview and restores the source.",
      dragCommit:
        "Pointer release removes the preview and restores the source. This demo does not import or commit any project file.",
      buttonActive:
        "The active-button specimen uses actual boolean state and shared active classes; toggle the neighboring hover switch independently.",
      warning: "Push info, warning or error messages into this Gallery’s local interaction store.",
      warningDisabled: "Clear all is disabled while no messages exist.",
      warningEmpty: "Clear all removes all messages and displays the empty count.",
      warningError:
        "Push error adds an actual local error-severity warning, not a backend failure.",
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
      automationEdit:
        "Use the actual selected-point value editor and production automation actions.",
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
      "na-focus":
        "The surface is not a keyboard-focusable control; use the external demo controls.",
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
      "na-cancel":
        "No reversible gesture or explicit cancellation contract belongs to this family.",
      "na-loading": "This family has no asynchronous resource loading.",
      "na-empty": "This family does not present a collection/resource empty state.",
      "na-error":
        "This family has no resource failure state; input validation is listed separately where applicable.",
      "na-retry": "This family has no failed resource operation to retry.",
    },
    domainStates: {
      mapping: "Mapping overlay",
      selected: "Selection",
      checked: "Checked / unchecked",
      expanded: "Expanded / collapsed",
      muted: "Mute",
      solo: "Solo",
      recordArm: "Record arm / unavailable",
      rename: "Inline rename",
      routing: "Input · output · monitor · sends",
      silence: "Silence / floor",
      negative: "Negative dB",
      unity: "Unity · 0 dB",
      overload: "Positive / overload",
      stereo: "Stereo separation",
      peakRise: "Peak rise",
      peakHold: "Peak hold · 600 ms",
      peakDecay: "Peak decay · 24 dB/s",
      peakReset: "External signal / peak reset",
      warp: "Warp on/off · mode unavailable",
      loop: "Loop enabled / bounds",
      velocity: "Velocity editing",
      bypass: "Device enabled / bypassed",
      titleColor: "Title / owning color synchronization",
    },
    domainNotes: {
      mapping:
        "Enable Mapping / Mapping target cues and inspect eligible real controls. This only demonstrates target highlighting, not a connected drag-to-bind action.",
      selected:
        "Use the actual selectable item, track, clip, note or device; its own state drives selection, not a forced CSS pseudo-state.",
      checked:
        "Toggle actual checkbox, radio or boolean controls. Disabled specimens remain unchanged.",
      expanded:
        "Use the actual trigger or disclosure control. Nested groups hide/show their real children; menus and devices follow their own expansion state.",
      muted:
        "Toggle the actual selected track’s mute control; this changes isolated project state, not an audio engine.",
      solo: "Toggle actual track Solo and compare its independent selected state and semantic color.",
      recordArm:
        "Audio/MIDI tracks can arm; group, return and main tracks cannot. The preview does not record audio or MIDI.",
      rename:
        "Use the actual title input. Enter/blur commits and Escape cancels. Blank names are accepted; no validation/error style is invented.",
      routing:
        "Inspect real expanded headers for the selected track kind; actual production routing/monitor/send availability and return/main constraints remain in effect.",
      silence: "Choose Silence; both channels fall to the real meter floor.",
      negative:
        "Choose Low or Nominal; calibrated below-unity segments use the actual meter’s yellow-to-green scale.",
      unity:
        "Choose 0 dB and inspect the actual calibrated unity marker, including track appearance.",
      overload:
        "Choose Overload; above-unity segments become red. This is not a latched clip indicator and the meter has no click-reset action.",
      stereo:
        "Compare mono/stereo in both orientations. Left/right values and peak markers remain independent.",
      peakRise: "Start or switch to a higher local signal: the shared peak rises immediately.",
      peakHold: "Stop the signal after a peak; the real peak marker holds for 600 ms before decay.",
      peakDecay:
        "After the hold, the real peak marker decays at 24 dB/s toward the current signal.",
      peakReset:
        "Use the labeled Reset local signal and peaks control. The meter surface itself does not reset on click.",
      warp: "Turn the actual Warp toggle off to disable its mode dropdown, then on to re-enable it. No DSP processing is claimed.",
      loop: "Use the selected clip’s actual loop toggle, position/length and available marker controls.",
      velocity:
        "Select and drag the real note-velocity handles; values belong to the actual MIDI notes.",
      bypass:
        "Toggle the production device enable control. It changes metadata/UI state only; no plugin host or audio DSP runs here.",
      titleColor:
        "Rename/recolor the current clip. Arrangement and detail read the same current clip identity and owning track color, with explicit override/inherit selection.",
    },
  },
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
