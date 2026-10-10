"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button, cx } from "../ui";

/**
 * Two-step destructive action: the first press asks, the second press does it.
 * Rendered inside a <form action={...}> so it posts (never a GET).
 */
export function ConfirmSubmit({
  label,
  confirmLabel,
  question,
  icon,
  size = "sm",
  className,
}: {
  label: string;
  confirmLabel: string;
  question: string;
  icon?: React.ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  const { pending } = useFormStatus();
  if (!asking) {
    return (
      <Button variant="ghost" size={size} onClick={() => setAsking(true)} className={cx("text-danger hover:bg-danger-soft", className)}>
        {icon}
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label={question}>
      <span className="text-sm font-semibold text-danger">{question}</span>
      <Button type="submit" variant="danger" size={size} disabled={pending} autoFocus>
        {pending ? "Working…" : confirmLabel}
      </Button>
      <Button variant="ghost" size={size} onClick={() => setAsking(false)}>Cancel</Button>
    </span>
  );
}

export function SubmitButton({ children, pendingLabel, ...rest }: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || rest.disabled} {...rest}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
