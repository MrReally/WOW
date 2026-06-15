import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  block?: boolean;
}

export function Button({ variant = "primary", block, className = "", ...rest }: ButtonProps) {
  return (
    <button
      className={`btn btn--${variant} ${block ? "btn--block" : ""} ${className}`}
      {...rest}
    />
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
