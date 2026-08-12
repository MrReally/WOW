import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ActionIcon, type ActionIconName } from "./ActionIcon.tsx";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  block?: boolean;
  mobileIcon?: ActionIconName;
}

export function Button({ variant = "primary", block, mobileIcon, className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      className={`btn btn--${variant} ${block ? "btn--block" : ""} ${mobileIcon ? "btn--mobile-icon" : ""} ${className}`}
      {...rest}
    >
      {mobileIcon ? <>
        <span className="btn__mobile-icon"><ActionIcon name={mobileIcon} /></span>
        <span className="btn__label">{children}</span>
      </> : children}
    </button>
  );
}

interface CardProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  style?: import("react").CSSProperties;
}

export function Card({ children, onClick, className = "", style }: CardProps) {
  return (
    <div
      className={`card ${onClick ? "card--tappable" : ""} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      style={style}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="section-title">{children}</div>;
}

interface MetricProps {
  value: ReactNode;
  label: ReactNode;
  tone?: "default" | "ok" | "danger";
}

export function Metric({ value, label, tone = "default" }: MetricProps) {
  return (
    <div className={`metric ${tone === "default" ? "" : `metric--${tone}`}`}>
      <div className="metric__value">{value}</div>
      <div className="metric__label">{label}</div>
    </div>
  );
}
