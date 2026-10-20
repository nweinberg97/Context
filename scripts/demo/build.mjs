/**
 * Builds the static, clickable demo for GitHub Pages into ./demo-site.
 *
 *   npm run demo:build
 *
 * It renders the real landing page and app components with sample data (no server,
 * no database), compiles the same Tailwind stylesheet, and adds scripts/demo/demo.js
 * so the main flow can be clicked through. Links are rewritten to relative demo pages,
 * so the site works under any base path (e.g. /Context/ on GitHub Pages).
 */
import { build } from "esbuild";
import { compile } from "tailwindcss";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const DEMO = path.join(ROOT, "scripts/demo");
const OUT = path.join(ROOT, "demo-site");
const TMP = path.join(ROOT, "node_modules/.cache/context-demo");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "fonts"), { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

// 1. Stylesheet: Tailwind v4, scanning the app source and the demo fixtures.
const twIndex = require.resolve("tailwindcss/index.css");
const twDir = path.dirname(twIndex);
const compiler = await compile(fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8"), {
  base: path.join(ROOT, "src/app"),
  loadStylesheet: async (id, base) => {
    let file = id === "tailwindcss" ? twIndex : id.startsWith("tailwindcss/") ? path.join(twDir, id.slice("tailwindcss/".length)) : path.resolve(base, id);
    if (!file.endsWith(".css")) file += ".css";
    return { content: fs.readFileSync(file, "utf8"), base: path.dirname(file), path: file };
  },
});
const candidates = new Set();
const scan = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(p);
    else if (/\.(tsx?|jsx?|css)$/.test(entry.name)) for (const m of fs.readFileSync(p, "utf8").matchAll(/[^<>"'`\s]+/g)) candidates.add(m[0]);
  }
};
scan(path.join(ROOT, "src"));
scan(DEMO);
const css = compiler.build([...candidates]).replaceAll('url("/fonts/', 'url("fonts/');
fs.writeFileSync(path.join(OUT, "app.css"), css);
for (const f of fs.readdirSync(path.join(ROOT, "public/fonts"))) fs.copyFileSync(path.join(ROOT, "public/fonts", f), path.join(OUT, "fonts", f));

// 2. Client scripts: the hero animation and the demo behaviour.
await build({
  stdin: {
    contents: `import { startSignalField } from "./src/components/marketing/signal-field-engine";
document.querySelectorAll("canvas[data-signal-field]").forEach((c) => startSignalField(c));`,
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2019",
  outfile: path.join(OUT, "hero.js"),
  logLevel: "warning",
});
fs.copyFileSync(path.join(DEMO, "demo.js"), path.join(OUT, "demo.js"));

// 3. Pages: bundle the fixtures with Next.js modules stubbed out, then render.
const renderer = path.join(TMP, "render.mjs");
await build({
  stdin: {
    contents: `import { renderToStaticMarkup } from "react-dom/server";
import { demoPages } from "./scripts/demo/pages";
export async function render() {
  const pages = await demoPages();
  return pages.map((p) => { globalThis.__DEMO_PATH__ = p.path; return { ...p, html: renderToStaticMarkup(p.element), element: undefined }; });
}`,
    resolveDir: ROOT,
    loader: "tsx",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  outfile: renderer,
  external: ["react", "react/*", "react-dom", "react-dom/*", "zod"],
  alias: {
    "next/link": path.join(DEMO, "stubs/link.tsx"),
    "next/navigation": path.join(DEMO, "stubs/navigation.ts"),
    "server-only": path.join(DEMO, "stubs/empty.ts"),
    "@": path.join(ROOT, "src"),
  },
  plugins: [
    {
      name: "demo-stubs",
      setup(b) {
        // Server actions and server-only modules are replaced with no-ops.
        b.onResolve({ filter: /(^|\/)(actions|habit-actions|source-actions)$/ }, () => ({ path: path.join(DEMO, "stubs/actions.ts") }));
      },
    },
  ],
  resolveExtensions: [".tsx", ".ts", ".js"],
  logLevel: "warning",
});
const { render } = await import(pathToFileURL(renderer).href);
const pages = await render();

const ROUTES = [
  [/^\/$/, "index.html"],
  [/^\/sign-up/, "sign-up.html"],
  [/^\/sign-in/, "sign-in.html"],
  [/^\/onboarding/, "import.html"],
  [/^\/import/, "import.html"],
  [/^\/review/, "review.html"],
  [/^\/today/, "today.html"],
  [/^\/routines/, "routines.html"],
  [/^\/settings/, "settings.html"],
];
function rewriteHref(href) {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const [pathPart, hash] = href.split("#");
  const route = ROUTES.find(([re]) => re.test(pathPart.split("?")[0]));
  if (!route) return "#";
  return route[1] + (hash ? `#${hash}` : "");
}

const DEMO_BAR = `<div class="no-print" style="background:#030509;color:#f3f5f9;font:500 13px/1.4 Archivo,system-ui,sans-serif;padding:8px 16px;text-align:center">
Demo with sample data. Nothing you do here is saved. <a href="index.html" style="color:#6f9bff;text-decoration:underline;text-underline-offset:3px">Back to the home page</a></div>`;
const TOAST = `<div id="demo-toast" role="status" hidden style="position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:50;background:#0a0d14;color:#fff;font:500 14px/1.4 Archivo,system-ui,sans-serif;padding:10px 16px;border-radius:8px;box-shadow:0 12px 32px -12px rgba(0,0,0,.5);max-width:calc(100% - 32px)"></div>`;

for (const page of pages) {
  const key = page.file.replace(/\.html$/, "");
  const body = page.html.replace(/href="([^"]*)"/g, (_, href) => `href="${rewriteHref(href)}"`);
  const isLanding = page.file === "index.html";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.title}</title>
<meta name="description" content="Turn the advice from your physio, coach or tutor into a simple routine you approve, follow and check off.">
<meta name="theme-color" content="#030509">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="preload" href="fonts/archivo-latin.woff" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="app.css">
</head>
<body class="min-h-dvh" data-demo-page="${isLanding ? "landing" : key}">
${isLanding ? "" : DEMO_BAR}
${body}
${TOAST}
${isLanding ? '<script src="hero.js" defer></script>' : ""}
<script src="demo.js" defer></script>
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT, page.file), html);
}
fs.copyFileSync(path.join(ROOT, "src/app/icon.svg"), path.join(OUT, "icon.svg"));
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
console.info(`Demo built: ${pages.length} pages in ${path.relative(process.cwd(), OUT) || "."}`);
