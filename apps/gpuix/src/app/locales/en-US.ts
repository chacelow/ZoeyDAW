/**
 * Application shell copy. Keys follow apps/web/src/locales/shared.en-US.ts, limited to
 * what the shell renders; section copy is injected by the composition root as labels.
 */
export default {
  app: {
    name: "zoeydaw",
    tagline: "Web UI DAW",
  },
  common: {
    loading: "Loading…",
    back: "Back",
    cancel: "Cancel",
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
