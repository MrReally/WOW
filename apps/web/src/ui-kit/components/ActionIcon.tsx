export type ActionIconName =
  | "edit"
  | "duplicate"
  | "save"
  | "add"
  | "delete"
  | "close"
  | "back"
  | "search"
  | "filter"
  | "settings"
  | "refresh"
  | "download"
  | "send"
  | "calendar"
  | "reminder"
  | "more";

export function ActionIcon({ name }: { name: ActionIconName }) {
  const line = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "edit":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.2-1 10.5-10.5a2.1 2.1 0 000-3l-.2-.2a2.1 2.1 0 00-3 0L5 15.8 4 20zM13.8 7l3.2 3.2M5 15.8l3.2 3.2" {...line} /></svg>;
    case "duplicate":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7V5.8A1.8 1.8 0 019.8 4h7.4A1.8 1.8 0 0119 5.8V12M6.8 8h7.4a1.8 1.8 0 011.8 1.8v7.4a1.8 1.8 0 01-1.8 1.8H6.8A1.8 1.8 0 015 17.2V9.8A1.8 1.8 0 016.8 8z" {...line} /><circle cx="18" cy="17" r="4" {...line} fill="var(--card)" /><path d="M18 15.2v3.6M16.2 17h3.6" {...line} /></svg>;
    case "save":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" {...line} /></svg>;
    case "add":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" {...line} /></svg>;
    case "delete":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4.8h6V7M7 7l1 13h8l1-13M10 11v5M14 11v5" {...line} /></svg>;
    case "close":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" {...line} /></svg>;
    case "back":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M11 6l-6 6 6 6" {...line} /></svg>;
    case "search":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5" {...line} /><path d="M15 15l4 4" {...line} /></svg>;
    case "filter":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6 7v6l-4 2v-8L4 5z" {...line} /></svg>;
    case "settings":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h5M14 7h5M5 12h9M18 12h1M5 17h2M11 17h8" {...line} /><circle cx="12" cy="7" r="2" {...line} /><circle cx="16" cy="12" r="2" {...line} /><circle cx="9" cy="17" r="2" {...line} /></svg>;
    case "refresh":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8V4l-2 2a8 8 0 10.8 11" {...line} /><path d="M19 4h-4" {...line} /></svg>;
    case "download":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10M8 11l4 4 4-4M5 18v2h14v-2" {...line} /></svg>;
    case "send":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l16-7-7 16-2.3-6.7L4 11zM10.7 13.3L20 4" {...line} /></svg>;
    case "calendar":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="2" {...line} /><path d="M8 4v4M16 4v4M4 10h16M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" {...line} /></svg>;
    case "reminder":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17h12l-1.5-2.5V10a4.5 4.5 0 00-9 0v4.5L6 17zM10 20h4" {...line} /><path d="M12 5V3" {...line} /></svg>;
    case "more":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></svg>;
  }
}
