"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconAdd, IconRoutines, IconSettings, IconToday } from "../icons";
import { cx } from "../ui";

const ITEMS = [
  { href: "/today", label: "Today", icon: IconToday },
  { href: "/routines", label: "Routines", icon: IconRoutines },
  { href: "/import", label: "Add advice", icon: IconAdd },
  { href: "/settings", label: "Settings", icon: IconSettings },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/import") return pathname.startsWith("/import") || pathname.startsWith("/review");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop: inline links in the top bar. */
export function TopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="App" className="hidden items-center gap-1 md:flex">
      {ITEMS.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "rounded-full px-4 py-2 font-semibold transition-colors",
              active ? "bg-ink text-paper" : "text-ink-2 hover:bg-ink/5",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile: a thumb-reachable bar at the bottom of the screen. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="App"
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx("flex flex-col items-center gap-1 py-2.5 text-xs font-semibold", active ? "text-ink" : "text-muted")}
              >
                <span className={cx("grid h-8 w-12 place-items-center rounded-full transition-colors", active && "bg-mark text-forest")}>
                  <Icon size={21} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
