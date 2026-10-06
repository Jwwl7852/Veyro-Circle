import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const source = new URL("../lib/image-compression.ts", import.meta.url);
const compiled = ts.transpileModule(readFileSync(source, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const m = {};
new Function("require", "exports", compiled)(createRequire(source), m);

test("listing uploads are limited to two compressed images", () => {
  assert.equal(m.MAX_LISTING_IMAGES, 2);
  assert.equal(m.MAX_IMAGE_EDGE, 1600);
  assert.ok(m.MAX_COMPRESSED_IMAGE_BYTES <= 1024 * 1024);
});

test("large portrait and landscape images retain their proportions", () => {
  assert.deepEqual(m.fitWithinBounds(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(m.fitWithinBounds(2000, 4000), { width: 800, height: 1600 });
  assert.deepEqual(m.fitWithinBounds(800, 600), { width: 800, height: 600 });
});

test("only common browser image formats are accepted", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) assert.equal(m.isSupportedImageType(type), true);
  for (const type of ["image/gif", "image/svg+xml", "application/pdf", ""]) assert.equal(m.isSupportedImageType(type), false);
});
