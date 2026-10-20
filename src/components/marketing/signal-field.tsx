"use client";

import { useEffect, useRef } from "react";
import { startSignalField } from "./signal-field-engine";

export function SignalField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => (ref.current ? startSignalField(ref.current) : undefined), []);
  return <canvas ref={ref} aria-hidden="true" data-signal-field="" className={className} />;
}
