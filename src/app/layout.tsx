import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "Context — Make good advice stick", template: "%s · Context" },
  description:
    "Turn the advice from your physio, coach or tutor into a simple routine you approve, follow and check off — from a message you choose to share.",
  applicationName: "Context",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#16271e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/bricolage-grotesque-latin.woff" as="font" type="font/woff" crossOrigin="anonymous" />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-mark focus:px-4 focus:py-2 focus:font-semibold focus:text-forest"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
