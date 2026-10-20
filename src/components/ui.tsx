import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Wordmark */

/**
 * CONTEXT, set wide. A blue rule sits under "TEXT": the part of a message that
 * becomes the routine.
 */
export function Wordmark({ className, tone = "ink" }: { className?: string; tone?: "ink" | "paper" }) {
  return (
    <span
      className={cx(
        "inline-flex items-baseline font-bold uppercase leading-none tracking-[0.16em] [font-stretch:125%]",
        tone === "paper" ? "text-ice" : "text-ink",
        className,
      )}
    >
      <span>con</span>
      <span className="relative">
        text
        <span aria-hidden="true" className="absolute -bottom-[0.28em] left-0 right-[0.16em] h-[0.12em] bg-blue" />
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------- Buttons */

type Variant = "primary" | "mark" | "secondary" | "ghost" | "danger" | "paper";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-forest-2 active:bg-forest",
  mark: "bg-blue text-white hover:bg-[#1f57e6] active:bg-[#1849c4]",
  secondary: "bg-white text-ink border border-line-2 hover:border-ink",
  ghost: "text-ink hover:bg-ink/5",
  danger: "bg-danger text-white hover:bg-[#931c22]",
  paper: "bg-paper text-forest hover:bg-white",
};
const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[0.9375rem] gap-1.5",
  md: "h-11 px-5 text-base gap-2",
  lg: "h-14 px-7 text-lg gap-2.5",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(
    "inline-flex shrink-0 items-center justify-center rounded-md font-semibold whitespace-nowrap select-none",
    "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

/* -------------------------------------------------------------------- Fields */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[0.9375rem] font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- Notice */

type Tone = "info" | "success" | "warning" | "error" | "dev";
const TONES: Record<Tone, string> = {
  info: "bg-sage/60 border-sage-2 text-ink",
  success: "bg-sage border-sage-2 text-forest",
  warning: "bg-mark-2 border-[#ecd27a] text-forest",
  error: "bg-danger-soft border-[#e7c4bb] text-danger",
  dev: "bg-forest text-paper border-forest",
};

export function Notice({ tone = "info", title, children, className, role }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string; role?: "status" | "alert" }) {
  return (
    <div role={role ?? (tone === "error" ? "alert" : "status")} className={cx("rounded-2xl border px-4 py-3 text-[0.9375rem] leading-snug", TONES[tone], className)}>
      {title ? <p className="font-bold">{title}</p> : null}
      {children ? <div className={title ? "mt-0.5" : undefined}>{children}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- Page title */

export function PageHeader({ title, lede, actions, back }: { title: ReactNode; lede?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:mb-10">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-title break-words">{title}</h1>
          {lede ? <p className="mt-3 text-lg text-muted">{lede}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2 no-print">{actions}</div> : null}
      </div>
    </header>
  );
}

export function Chip({ children, tone = "line", title }: { children: ReactNode; tone?: "line" | "sage" | "mark"; title?: string }) {
  const tones = {
    line: "border border-line-2 text-ink-2",
    sage: "bg-sage text-forest",
    mark: "bg-mark-2 text-forest",
  };
  return (
    <span title={title} className={cx("inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium", tones[tone])}>
      <span className="truncate">{children}</span>
    </span>
  );
}
