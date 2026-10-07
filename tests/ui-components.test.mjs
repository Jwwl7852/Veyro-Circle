import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("keeps the application width stable and prints agreements as A4", async () => {
  const css = await readFile(path.join(root, "app", "globals.css"), "utf8");
  assert.match(css, /html\s*\{\s*scrollbar-gutter:stable/);
  assert.match(css, /html,body\s*\{[^}]*overflow-x:clip/);
  assert.match(css, /\.profile-head\s*\{[^}]*display:grid[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\[data-slot="dialog-content"\][^{]*\{[^}]*max-height:calc\(100dvh - 1rem\)/);
  assert.match(css, /\.mobile-nav-item\s*\{[^}]*min-width:0[^}]*flex:1/);
  assert.match(css, /@page\s*\{\s*size:A4 portrait/);
  assert.match(css, /\.agreement-dialog\s*\{[^}]*position:absolute!important/);
  assert.match(css, /\.print-agreement\s*\{[^}]*position:static!important/);
});

test("agreement offers separate account storage and a standalone print document", async () => {
  const page = await readFile(path.join(root, "app", "page.tsx"), "utf8");
  assert.match(page, /Gem på min konto/);
  assert.match(page, /Udskriv aftalen/);
  assert.match(page, /function printAgreementDocument/);
  assert.match(page, /document\.createElement\("iframe"\)/);
  assert.match(page, /printWindow\.print\(\)/);
  assert.match(page, /12 måneder/);
  assert.match(page, /crypto\.randomUUID\(\)/);
  assert.match(page, /Ticket:/);
  assert.match(page, /formatAgreementDate/);
  assert.match(page, /Returkvittering/);
  assert.match(page, /Tilbageleveret i god stand/);
  assert.match(page, /borrowerReturnSignature/);
  assert.match(page, /lenderReturnSignature/);
  assert.match(page, /Tilstandsnote ved udlevering/);
  assert.match(page, /Tilstandsnote ved tilbagelevering/);
  assert.match(page, /Noten er låst/);
  assert.match(page, /Tilbageleveret med bemærkninger/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});
