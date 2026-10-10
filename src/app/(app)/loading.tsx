export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse">
      <div className="h-4 w-24 rounded-full bg-line" />
      <div className="mt-3 h-12 w-72 max-w-full rounded-2xl bg-line" />
      <div className="mt-10 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-[var(--radius-card)] bg-white ring-1 ring-line" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
