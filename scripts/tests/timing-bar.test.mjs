#!/usr/bin/env node
// The bake's timing-bar hit test, kept pure so it can be checked without a scene.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import tsCompiler from "typescript";

const js = tsCompiler.transpileModule(readFileSync("src/systems/TimingBar.ts", "utf8"), {
  compilerOptions: { module: tsCompiler.ModuleKind.CommonJS, target: tsCompiler.ScriptTarget.ES2020 },
}).outputText;
const moduleObject = { exports: {} };
runInNewContext(js, { module: moduleObject, exports: moduleObject.exports, require: () => ({}) });
const { isHit } = moduleObject.exports;

// The sweet spot is a band of `fraction` centred on `centre`, inclusive at both edges.
assert.equal(isHit(0.5, 0.5, 0.2), true);
assert.equal(isHit(0.4, 0.5, 0.2), true, "left edge counts");
assert.equal(isHit(0.6, 0.5, 0.2), true, "right edge counts");
assert.equal(isHit(0.39, 0.5, 0.2), false);
assert.equal(isHit(0.61, 0.5, 0.2), false);
// Default band is generous enough that a reaction-time press near the middle lands, and narrow
// enough that a random press mostly does not.
assert.equal(isHit(0.5, 0.5), true);
assert.equal(isHit(0.6, 0.5), true);
assert.equal(isHit(0.8, 0.5), false);
assert.equal(isHit(0.0, 0.5), false);
// Off-centre targets work the same way.
assert.equal(isHit(0.25, 0.3), true);
assert.equal(isHit(0.9, 0.3), false);

console.log("timing-bar.test.mjs: all assertions passed");
