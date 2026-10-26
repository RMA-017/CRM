import "../css/components/action-icon-button.css";

const paths = {
  swap: "M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4",
  filter: "M4 5h16l-6 7v6l-4 2v-8Z", export: "M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5",
  refresh: "M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1",
  add: "M12 5v14M5 12h14", edit: "m15 5 4 4M4 20l5-1L20 8l-4-4L5 15ZM4 20h16",
  remove: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7",
  close: "m6 6 12 12M18 6 6 18", save: "M5 3h12l4 4v14H3V3ZM7 3v6h10V3M7 21v-8h10v8",
  check: "m5 12 4 4L19 6", search: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  previous: "m15 5-7 7 7 7", next: "m9 5 7 7-7 7", undo: "M9 5 3 11l6 6M3 11h11a6 6 0 0 1 6 6",
  restore: "m15 5 6 6-6 6M21 11H10a6 6 0 0 0-6 6", reset: "M4 4v6h6M4 10a8 8 0 1 1 0 5"
};

export default function ActionIconButton({ label, icon, busy = false, className = "", children, ...props }) {
  return <button type="button" {...props} className={`action-icon-button ${className}`} aria-label={label} title={label} aria-busy={busy || undefined}>
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={busy ? "is-busy" : undefined}>
      <path d={paths[busy ? "refresh" : icon] || paths.check} />
    </svg>{children}
  </button>;
}
