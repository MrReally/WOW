import type { ReactNode } from "react";

export type Tone = "ok" | "alert" | "danger" | "warn" | "info" | "purple" | "accent" | "neutral";

/* ── Workspace glyph — geometric marks only (from the v2 design) ────── */
export type Glyph = "radar" | "box" | "grid" | "rows" | "coin" | "shield" | "pin" | "person" | "doc";

export function WSGlyph({ type, size = 22 }: { type: Glyph; size?: number }) {
  const p = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const S = { width: size, height: size, viewBox: "0 0 24 24" };
  switch (type) {
    case "radar":
      return <svg {...S}><circle cx="12" cy="12" r="9" {...p} /><circle cx="12" cy="12" r="4.6" {...p} /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></svg>;
    case "box":
      return <svg {...S}><rect x="4.5" y="6" width="15" height="13" rx="1.8" {...p} /><line x1="4.5" y1="10.5" x2="19.5" y2="10.5" {...p} /><line x1="12" y1="6" x2="12" y2="10.5" {...p} /></svg>;
    case "grid":
      return <svg {...S}>{[[6, 6], [14, 6], [6, 14], [14, 14]].map(([x, y], i) => <rect key={i} x={x} y={y} width="5" height="5" rx="1.2" {...p} />)}</svg>;
    case "rows":
      return <svg {...S}>{[[6, 7, 12], [6, 12, 10], [6, 17, 6]].map(([x, y, w], i) => <line key={i} x1={x} y1={y} x2={x! + w!} y2={y} {...p} />)}</svg>;
    case "coin":
      return <svg {...S}><circle cx="12" cy="12" r="8.2" {...p} /><line x1="8" y1="12" x2="16" y2="12" {...p} /><line x1="12" y1="9.4" x2="12" y2="14.6" {...p} /></svg>;
    case "shield":
      return <svg {...S}><path d="M12 3.5l7 2.6v5c0 4.4-3 7.4-7 9.4-4-2-7-5-7-9.4v-5z" {...p} /><path d="M9 12l2.2 2.2L15.4 10" {...p} /></svg>;
    case "pin":
      return <svg {...S}><path d="M12 21c4-4.2 6.2-7.4 6.2-10.4A6.2 6.2 0 0012 4.4a6.2 6.2 0 00-6.2 6.2C5.8 13.6 8 16.8 12 21z" {...p} /><circle cx="12" cy="10.4" r="2.3" {...p} /></svg>;
    case "person":
      return <svg {...S}><circle cx="12" cy="8" r="3.4" {...p} /><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" {...p} /></svg>;
    case "doc":
      return <svg {...S}><path d="M7 3.5h6l4 4v13H7z" {...p} /><path d="M13 3.5v4h4" {...p} /><line x1="9.5" y1="13" x2="14.5" y2="13" {...p} /><line x1="9.5" y1="16.4" x2="14.5" y2="16.4" {...p} /></svg>;
    default:
      return null;
  }
}

const toneVar: Record<Tone, string> = {
  ok: "var(--ok)",
  alert: "var(--alert)",
  danger: "var(--alert)",
  warn: "var(--warn)",
  info: "var(--info)",
  purple: "var(--accent)",
  accent: "var(--accent)",
  neutral: "var(--text2)",
};

/* Workspace "app icon" tinted by its hue. */
export function WSChip({ glyph, tone = "accent", size = 44 }: { glyph: Glyph; tone?: Tone; size?: number }) {
  return (
    <div
      className="ws-chip"
      style={{ width: size, height: size, ["--ws-c" as string]: toneVar[tone] }}
    >
      <WSGlyph type={glyph} size={size * 0.5} />
    </div>
  );
}

export function Dot({ tone = "neutral", glow = false, size = 7 }: { tone?: Tone; glow?: boolean; size?: number }) {
  return <span className={`dot dot--${tone} ${glow ? "dot--glow" : ""}`} style={{ width: size, height: size }} />;
}

export function Chip({ label, tone = "neutral", solid = false }: { label: ReactNode; tone?: Tone; solid?: boolean }) {
  return <span className={`chip chip--${tone} ${solid ? "chip--solid" : ""}`}>{label}</span>;
}

export function ProgressBar({ pct, tone = "accent", height = 7 }: { pct: number; tone?: Tone; height?: number }) {
  return (
    <div className="progress" style={{ height, borderRadius: height / 2 }}>
      <div
        className="progress__fill"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: height / 2, background: toneVar[tone] }}
      />
    </div>
  );
}

export function ProgressRing({
  pct,
  size = 128,
  stroke = 11,
  tone = "accent",
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--s3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={toneVar[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - Math.max(0, Math.min(100, pct)) / 100)}
        />
      </svg>
      <div className="ring__center">{children}</div>
    </div>
  );
}

export function Avatar({ initials, size = 34, src }: { initials: string; size?: number; src?: string | null }) {
  const imageSrc = src && !src.startsWith("telegram-file:") ? src : null;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.3 }}>
      {imageSrc ? <img src={imageSrc} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : initials}
    </span>
  );
}

export function AvatarStack({ people, extra = 0 }: { people: string[]; extra?: number }) {
  return (
    <div className="avatar-stack">
      {people.map((p, i) => (
        <Avatar key={p + i} initials={p} size={32} />
      ))}
      {extra > 0 && <Avatar initials={`+${extra}`} size={32} />}
    </div>
  );
}

export function SectionHead({ label, meta }: { label: ReactNode; meta?: ReactNode }) {
  return (
    <div className="section-head">
      <span className="section-head__label">{label}</span>
      {meta != null && <span className="section-head__meta">{meta}</span>}
    </div>
  );
}

/* A clearly-marked placeholder for features that are designed but not built yet,
   so they don't read as broken buttons. Non-interactive by design. */
export function ComingSoon({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    <div
      className="card card--flat"
      style={{ opacity: 0.75, cursor: "default", display: "flex", alignItems: "center", gap: 12 }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="card__title" style={{ color: "var(--text2)" }}>{title}</div>
        {hint && <div className="card__subtitle">{hint}</div>}
      </div>
      <Chip label="скоро" tone="neutral" />
    </div>
  );
}

/* Faint architectural arena blueprint — "where this is happening" (decorative). */
export function VenueTrace({ width = 200, height = 150, style }: { width?: number; height?: number; style?: React.CSSProperties }) {
  return (
    <svg width={width} height={height} viewBox="0 0 200 150" fill="none" preserveAspectRatio="xMidYMid meet" style={style}>
      <g stroke="var(--text3)" strokeWidth="1" fill="none">
        <ellipse cx="100" cy="75" rx="86" ry="60" />
        <ellipse cx="100" cy="75" rx="66" ry="45" opacity="0.7" />
        <ellipse cx="100" cy="75" rx="46" ry="31" opacity="0.5" />
        <rect x="74" y="59" width="52" height="32" rx="2" />
        <line x1="100" y1="15" x2="100" y2="34" opacity="0.5" />
        <line x1="100" y1="116" x2="100" y2="135" opacity="0.5" />
        <line x1="14" y1="75" x2="33" y2="75" opacity="0.5" />
        <line x1="167" y1="75" x2="186" y2="75" opacity="0.5" />
        <circle cx="100" cy="75" r="2.4" fill="var(--text3)" stroke="none" />
      </g>
    </svg>
  );
}
