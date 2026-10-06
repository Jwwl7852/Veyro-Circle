import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root,
  resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false },
});
after(() => vite.close());

test("tax acknowledgement is specific to one country and the current guidance", async () => {
  const { hasReadTaxGuidance, TAX_GUIDANCE_VERSION } = await vite.ssrLoadModule("/lib/tax-guidance.ts");
  const ack = { version: TAX_GUIDANCE_VERSION, country: "DK", acceptedAt: "2026-09-05T12:00:00Z" };
  assert.equal(hasReadTaxGuidance(undefined, "DK"), false);
  assert.equal(hasReadTaxGuidance(ack, "DK"), true);
  assert.equal(hasReadTaxGuidance(ack, "SE"), false);
  assert.equal(hasReadTaxGuidance({ ...ack, version: "2025-01-01" }, "DK"), false);
  assert.equal(hasReadTaxGuidance({ ...ack, acceptedAt: "" }, "DK"), false);
});

test("guidance and official links follow profile country, independently of language", async () => {
  const { TaxGuidance } = await vite.ssrLoadModule("/components/tax-guidance.tsx");
  for (const lang of ["da", "sv"]) {
    const dk = renderToStaticMarkup(React.createElement(TaxGuidance, { lang, country: "DK" }));
    const se = renderToStaticMarkup(React.createElement(TaxGuidance, { lang, country: "SE" }));
    assert.match(dk, /12[. ]500 DKK/);
    assert.match(dk, /https:\/\/skat.dk\//);
    assert.doesNotMatch(dk, /120[. ]000 SEK|href="https:\/\/www.skatteverket/);
    assert.match(se, /120[. ]000 SEK/);
    assert.match(se, /https:\/\/www.skatteverket.se\//);
    assert.doesNotMatch(se, /12[. ]500 DKK|href="https:\/\/skat.dk/);
  }
});

test("new profile requires an explicit country before signup can continue", async () => {
  const { ProfileForm } = await vite.ssrLoadModule("/components/marketplace-fields.tsx");
  const html = renderToStaticMarkup(React.createElement(ProfileForm, { lang: "da", profile: null, onSave() {} }));
  assert.match(html, /Vælg ét land/);
  assert.match(html, /type="email"/);
  assert.match(html, /type="password"[^>]*minLength="8"/);
  assert.match(html, /e-mail er dit login/);
  assert.match(html, /disabled[^>]*>Opret testkonto/);
  assert.doesNotMatch(html, /id="tax-heading"/);
});
