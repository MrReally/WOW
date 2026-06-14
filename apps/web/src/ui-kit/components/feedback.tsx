import type { ReactNode } from "react";

export function Spinner() {
  return <div className="spinner" aria-label="Загрузка" />;
}

export function Loading({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div className="center-state">
      <Spinner />
      <div>{label}</div>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="center-state">
      <div style={{ fontSize: "var(--fs-md)", color: "var(--text)" }}>{title}</div>
      {hint && <div>{hint}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Что-то пошло не так";
  return (
    <div className="center-state">
      <div style={{ color: "var(--danger)" }}>{message}</div>
      {onRetry && (
        <button className="btn btn--secondary" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}
