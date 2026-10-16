import { creationNamesByLocale } from "./creation-names"

/**
 * Application shell copy. Keys follow apps/web/src/locales/shared.en-US.ts, limited to
 * what the shell renders; section copy is injected by the composition root as labels.
 */
export default {
  creationNames: creationNamesByLocale["en-US"],
  snapshotErrors: {
    read: "Could not read snapshot storage.",
    invalid: "The local snapshot is invalid or unsupported. Current project was kept.",
    write: "Could not save the local snapshot. Check storage availability.",
    missing: "No local snapshot exists for this project.",
  },
  panel: {
    footer: "Footer",
    browser: "Browser",
    arrangement: "Arrangement",
    activeDescription: "Active panel",
    toggleFixed: "Toggle {{panel}}",
  },
  control: { on: "ON", off: "OFF" },
  track: { monitorModes: { off: "Off", auto: "Auto", in: "In" } },
  app: {
    name: "zoeydaw",
    tagline: "Web UI DAW",
  },
  common: {
    loading: "Loading…",
    back: "Back",
    cancel: "Cancel",
    retry: "Retry",
    loadFailed: "Loading failed",
  },
  home: {
    title: "Projects",
    emptyTitle: "No projects yet",
    emptyHint: "Click “New project” to start a DAW session.",
    createAction: "New project",
    openAction: "Open",
    recent: "Recent",
  },
  project: {
    resizeBrowser: "Resize Browser",
    resizeClipEdit: "Resize Clip Edit",
    untitled: "Untitled project",
  },
  about: {
    prototype: "prototype scaffold",
    sourceHint: "Audio engine, CLAP + VST3 host, Browser, .als import land as the UI needs them.",
  },
  settings: {
    title: "Settings",
    close: "Close settings",
    navigation: "Settings sections",
    languageDescription: "Choose the language used by the application interface.",
    sections: {
      appearance: "Appearance",
      language: "Language",
      logs: "Logs",
      about: "About",
    },
    themePreset: "Theme preset",
    themeMode: "Theme",
    systemUnavailable:
      "Following the system needs the native appearance capability; unavailable for now.",
    themeNotPersisted: "The theme could not be saved; it resets after restart.",
    logsPlaceholder:
      "Log level and directory controls will land when the Rust logging commands are wired in.",
  },
  routeError: {
    title: "This page ran into a problem",
    description:
      "zoeydaw cannot continue displaying this page. Reload it, or return home to keep working.",
    retry: "Reload",
    home: "Return home",
    details: "Error details",
  },
  notFound: {
    title: "404",
  },
  windowClose: {
    title: "The project has unsaved changes",
    description: "Before leaving, save, discard the changes, or cancel.",
    save: "Save",
    discard: "Don't save",
    saveFailed: "Saving failed. The current project remains open.",
    closeFailed: "The window could not close. Try closing it again.",
  },
  notifications: {
    title: "Notifications",
    dismiss: "Dismiss",
    loading: "Loading",
  },
  titlebar: {
    settings: "Settings",
  },
}
