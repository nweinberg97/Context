import type { AnchorHTMLAttributes, ReactNode } from "react";

/** Plain anchor for the static demo. Hrefs are rewritten to demo pages after rendering. */
export default function Link({
  href,
  children,
  prefetch: _prefetch,
  replace: _replace,
  scroll: _scroll,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string | { pathname?: string }; prefetch?: boolean; replace?: boolean; scroll?: boolean; children?: ReactNode }) {
  return (
    <a href={typeof href === "string" ? href : String((href as { pathname?: string }).pathname ?? "#")} {...rest}>
      {children}
    </a>
  );
}
