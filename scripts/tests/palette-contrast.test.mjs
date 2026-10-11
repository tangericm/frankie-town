#!/usr/bin/env node
// WCAG contrast check for the "Hearth & Parchment" palette (src/systems/palette.ts). Pure math,
// no deps -- loads the .ts source the same way objectives.test.mjs etc. do, so this stays in sync
// with the real PALETTE export instead of a copy-pasted hex table that can drift.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import tsCompiler from "typescript";

const cache = new Map();
function loadTs(filename) {
  const absolute = path.resolve(filename);
  if (cache.has(absolute)) return cache.get(absolute);
  const js = tsCompiler.transpileModule(readFileSync(absolute, "utf8"), {
    compilerOptions: { module: tsCompiler.ModuleKind.CommonJS, target: tsCompiler.ScriptTarget.ES2020 },
  }).outputText;
  const moduleObject = { exports: {} };
  cache.set(absolute, moduleObject.exports);
  runInNewContext(js, {
    module: moduleObject,
    exports: moduleObject.exports,
    require(specifier) {
      if (specifier === "phaser") return {};
      const resolved = path.resolve(path.dirname(absolute), specifier.endsWith(".ts") ? specifier : `${specifier}.ts`);
      return loadTs(resolved);
    },
  });
  cache.set(absolute, moduleObject.exports);
  return moduleObject.exports;
}

const { PALETTE } = loadTs("src/systems/palette.ts");

// WCAG 2.x relative luminance + contrast ratio (https://www.w3.org/TR/WCAG20/#relativeluminancedef).
function channel(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

const MIN = 4.5;
// The accent pairs only ever carry large/bold text (CTA labels, the text-size setting's active
// segment) rather than paragraph body copy -- WCAG's own large-text minimum is 3:1, but the
// palette was tuned to clear the same 4.5:1 floor as everything else, so this test holds every
// pair to one number rather than special-casing a lower bar for them.
const PAIRS = [
  ["text/panel", PALETTE.text, PALETTE.panel],
  ["textMuted/panel", PALETTE.textMuted, PALETTE.panel],
  ["text/panelLight", PALETTE.text, PALETTE.panelLight],
  ["panelLight/panelDark", PALETTE.panelLight, PALETTE.panelDark],
  ["text/accent", PALETTE.text, PALETTE.accent],
  ["panelLight/accentDark", PALETTE.panelLight, PALETTE.accentDark],
];

let failed = false;
for (const [name, a, b] of PAIRS) {
  const ratio = contrast(a, b);
  const ok = ratio >= MIN;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${ratio.toFixed(2)}:1 (min ${MIN}:1)`);
  if (!ok) failed = true;
}
assert.ok(!failed, "one or more palette pairs fell below the 4.5:1 contrast floor");

console.log("palette-contrast.test.mjs: all assertions passed");
