import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import tsCompiler from "typescript";

const src = readFileSync("src/systems/DialogueSequencer.ts", "utf8");
const js = tsCompiler.transpileModule(src, {
  compilerOptions: { module: tsCompiler.ModuleKind.CommonJS, target: tsCompiler.ScriptTarget.ES2020 },
}).outputText;

const moduleObj = { exports: {} };
runInNewContext(js, { module: moduleObj, exports: moduleObj.exports, require: () => ({}) });
let SequencerClass = moduleObj.exports.DialogueSequencer;

// Convert VM context objects to main context for deepEqual compatibility
const DialogueSequencer = class extends SequencerClass {
  current() {
    const result = super.current();
    return result && typeof result === 'object' ? Object.assign({}, result) : result;
  }
};

// A plain line has one phase and one advance() moves past it.
{
  const seq = new DialogueSequencer([{ speaker: "Teddy", text: "Welcome!" }]);
  assert.deepEqual(seq.current(), { speaker: "Teddy", text: "Welcome!", phase: "plain" });
  assert.equal(seq.isDone(), false);
  assert.equal(seq.advance(), false); // no more lines
  assert.equal(seq.isDone(), true);
  assert.equal(seq.current(), null);
}

// A two-phase line surfaces noise -> bumper -> english, each its own advance().
{
  const seq = new DialogueSequencer([
    { speaker: "Rafa", noise: "Woof! Awrf-awrf!", bumper: "Translated live by BARKBOX AI(tm)", english: "It's Michell's birthday!" },
  ]);
  assert.deepEqual(seq.current(), { speaker: "Rafa", text: "Woof! Awrf-awrf!", phase: "noise" });
  assert.equal(seq.advance(), true);
  assert.deepEqual(seq.current(), { speaker: "Rafa", text: "Translated live by BARKBOX AI(tm)", phase: "bumper" });
  assert.equal(seq.advance(), true);
  assert.deepEqual(seq.current(), { speaker: "Rafa", text: "It's Michell's birthday!", phase: "english" });
  assert.equal(seq.advance(), false); // that was the last line
  assert.equal(seq.isDone(), true);
}

// Multiple lines advance in order, mixing plain and two-phase.
{
  const seq = new DialogueSequencer([
    { speaker: "Rafa", noise: "Bark!", bumper: "...", english: "Hi Frankie." },
    { speaker: "Frankie", text: "(tail wag)" },
  ]);
  assert.equal(seq.current().phase, "noise");
  seq.advance(); // -> bumper
  seq.advance(); // -> english
  assert.equal(seq.advance(), true); // -> next line
  assert.deepEqual(seq.current(), { speaker: "Frankie", text: "(tail wag)", phase: "plain" });
  assert.equal(seq.isDone(), false);
}

console.log("dialogue-sequencer.test.mjs: all assertions passed");
