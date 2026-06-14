import type { ReactNode } from "react";

export type BadgeTone = "ok" | "warn" | "danger" | "info" | "neutral";

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span className={`badge badge--${tone}`}>
      <span className="badge__dot" />
      {children}
    </span>
  );
}
