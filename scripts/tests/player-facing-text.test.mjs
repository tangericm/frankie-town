#!/usr/bin/env node
// Every string the player actually reads, checked for the punctuation and typography we don't want
// shipping in this game's voice.
//
// The rule that motivated this file: no dashes standing in for a comma, colon, or full stop. The
// dialogue had picked up nine of them ("the eggs are yours -- birthday rates, obviously"), which is
// a tell rather than a style, and rewriting them by hand only fixes the ones that exist today. This
// test is the part that keeps them from coming back.
//
// Scope is deliberately player-facing values only -- the exported data. Source comments in these
// same files use "--" heavily and are none of this test's business, which is why it walks the
// evaluated exports rather than grepping the text.
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

const MODULES = [
  "src/data/apartment.gameplay.ts",
  "src/data/bakery.gameplay.ts",
  "src/data/market.gameplay.ts",
  "src/data/street.gameplay.ts",
  "src/data/quest.ts",
  "src/data/objectives.ts",
  "src/data/propThoughts.ts",
  "src/data/ending.ts",
];

// Keys whose values are identifiers, asset keys or animation names, not prose. A texture key is
// allowed to contain anything; a line of dialogue is not.
const NOT_PROSE = new Set(["id", "key", "texture", "sheet", "filename", "ingredient", "containerTexture", "anim", "animation", "facing", "entry", "spawnId", "scene", "target", "textureKey", "scenes"]);

/** Every prose string reachable from a module's exports, with a path for the failure message. */
function proseStrings(value, trail, out) {
  if (typeof value === "string") {
    out.push({ trail, value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => proseStrings(item, `${trail}[${index}]`, out));
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (NOT_PROSE.has(key)) continue;
      proseStrings(item, `${trail}.${key}`, out);
    }
  }
  return out;
}

// A run of two or more ASCII hyphens, or a real en/em dash. Single hyphens are fine: they are
// hyphenating words ("mid-stitch", "birthday-cake"), which is not what this is about.
const BANNED = /--+|[–—]/;

let checked = 0;
const offenders = [];
for (const module of MODULES) {
  const exported = loadTs(module);
  for (const [name, value] of Object.entries(exported)) {
    if (typeof value === "function") continue;
    for (const { trail, value: text } of proseStrings(value, name, [])) {
      checked += 1;
      if (BANNED.test(text)) offenders.push(`${module} ${trail}: ${JSON.stringify(text)}`);
    }
  }
}

assert.equal(
  offenders.length,
  0,
  `player-facing text must not use "--", en dashes or em dashes -- use a comma, colon or full stop instead:\n  ${offenders.join("\n  ")}`,
);
assert.ok(checked > 60, `expected to have checked a meaningful amount of player-facing text, only saw ${checked}`);

// The dialogue-building helpers take arguments, so their output is not reachable by walking the
// exports above. Cover the ones that produce prose.
const bakery = loadTs("src/data/bakery.gameplay.ts");
for (const remaining of [1, 2, 3]) {
  for (const line of bakery.teddyBusyLines(remaining)) {
    assert.doesNotMatch(line.text, BANNED, `teddyBusyLines(${remaining}) must not use dashes`);
  }
}

console.log(`player-facing-text.test.mjs: all assertions passed (${checked} strings checked)`);
