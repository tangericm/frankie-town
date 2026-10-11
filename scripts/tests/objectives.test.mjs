#!/usr/bin/env node
// The one-line "where now?" objective (src/data/objectives.ts) walked through the whole quest, from
// every scene the player can be standing in. Pure logic over GameState, no Phaser.
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

const { GameState } = loadTs("src/systems/GameState.ts");
const { currentObjective } = loadTs("src/data/objectives.ts");
const SCENES = ["Apartment", "Street", "Bakery", "Market", "PaninisFlat"];

// Objects cross a vm context boundary, so their prototypes differ from this file's -- compare by
// value, not by deepStrictEqual's prototype-aware structure check.
const eq = (actual, expected, message = "objective matches quest progress") => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);

const state = new GameState();

// Nothing to do during the opening cutscene, in any scene.
for (const scene of SCENES) assert.equal(currentObjective(state, scene), null, `${scene} before intro`);

// Rafa has spoken: flour is the goal, and the way out is lit from wherever you are.
state.markIntroSeen();
eq(currentObjective(state, "Apartment"), { text: "Teddy's Bakery, south door", doorTarget: "Street" });
eq(currentObjective(state, "Street"), { text: "Teddy's Bakery", doorTarget: "Bakery" });
eq(currentObjective(state, "Bakery"), { text: "Talk to Teddy" });
assert.equal(currentObjective(state, "Market").doorTarget, "Street", "wandered into the market early: point back out");

// Inside the bakery the line tracks the errand, and no door is lit while the goal is in the room.
state.startErrand();
eq(currentObjective(state, "Bakery"), { text: "Find Teddy's supplies, 0/3" });
state.collectBakeryItem("wooden-spoon");
state.collectBakeryItem("oven-mitt");
eq(currentObjective(state, "Bakery"), { text: "Find Teddy's supplies, 2/3" });
state.collectBakeryItem("measuring-cup");
eq(currentObjective(state, "Bakery"), { text: "Back to Teddy" });

// Flour in hand: everything points at the market.
state.addIngredient("flour");
eq(currentObjective(state, "Bakery"), { text: "Pierre's market, back to the street", doorTarget: "Street" });
eq(currentObjective(state, "Street"), { text: "Pierre's market, through the arch", doorTarget: "Market" });
eq(currentObjective(state, "Apartment"), { text: "Pierre's market, south door", doorTarget: "Street" });
eq(currentObjective(state, "Market"), { text: "Talk to Pierre" });

// Both market errands shown at once, each counting on its own, no door lit.
state.markPierreMet();
eq(currentObjective(state, "Market"), { text: "Eggs: hen coop (0/3 hens)\nSugar: market games (0/3)" });
state.homeMarketHen("hen-a");
state.collectMarketSugarCube("lane1");
state.collectMarketSugarCube("lane3");
eq(currentObjective(state, "Market"), { text: "Eggs: hen coop (1/3 hens)\nSugar: market games (2/3)" });
state.homeMarketHen("hen-b");
state.homeMarketHen("hen-c");
eq(currentObjective(state, "Market"), { text: "Eggs: see Pierre\nSugar: market games (2/3)" });
state.addIngredient("eggs");
eq(currentObjective(state, "Market"), { text: "Sugar: market games (2/3)" });
state.collectMarketSugarCube("lane2");
state.addIngredient("sugar");

// The last ingredient lives upstairs; three ingredients must not trigger the ending.
eq(currentObjective(state, "Street"), { text: "Butter: Panini's flat, up the stairs", doorTarget: "PaninisFlat" });
// Saying hello to the cat (the cupboard guard line) comes before the toys.
eq(currentObjective(state, "PaninisFlat"), { text: "Say hello to Panini" });
state.setFlag("paniniMet");
eq(currentObjective(state, "PaninisFlat"), { text: "Play with Panini: mouse and basket" });
state.setFlag("paniniToyTried");
eq(currentObjective(state, "PaninisFlat"), { text: "Let Panini inspect the basket" });
state.setFlag("paniniBasketTried");
eq(currentObjective(state, "PaninisFlat"), { text: "Open the curtains for Panini’s nap" });
state.setFlag("paniniMoved");
eq(currentObjective(state, "PaninisFlat"), { text: "Take the butter from the cupboard" });
state.addIngredient("butter");
// All four: home, and the apartment door is the lit one from the street.
eq(currentObjective(state, "Market"), { text: "Back to the street", doorTarget: "Street" });
eq(currentObjective(state, "Street"), { text: "Home, to Rafa", doorTarget: "Apartment" });
eq(currentObjective(state, "Apartment"), { text: "Tell Rafa" });

// Hearing Rafa is not completion: a reload must still point him back to the unfinished celebration.
state.markEndingSeen();
eq(currentObjective(state, "Apartment"), { text: "Tell Rafa" });
state.setFlag("bakeDone");
eq(currentObjective(state, "Street"), { text: "Home, to Rafa", doorTarget: "Apartment" });
state.setFlag("cakeGiven");
eq(currentObjective(state, "Apartment"), { text: "Ask Michell about dinner" });
state.setFlag("dinnerStarted");
for (const flag of ["dinnerPlush", "dinnerBowls", "dinnerSkyline"]) state.setFlag(flag);
eq(currentObjective(state, "Apartment"), { text: "Back to the Street: outdoor café tables", doorTarget: "Street" });
state.setFlag("dinnerRevealed");
for (const scene of SCENES) assert.equal(currentObjective(state, scene), null, `${scene} after ending`);

console.log("objectives.test.mjs: all assertions passed");
