#!/usr/bin/env node
// Prop thoughts are flavour zones laid over rooms that already have quest zones in them. Two
// things went wrong the first time and this test keeps them from coming back:
//  - a thought centred inside a gameplay zone (the coop 17px from the market gate, a "bread
//    basket" on the hiding-spot chair) makes that gameplay zone hard or impossible to reach;
//  - a textureKey that isn't in the generated scene (two market keys were wrong, one pointed at
//    the coop) silently gives the thought no tap target on touch.
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
      return loadTs(path.resolve(path.dirname(absolute), specifier.endsWith(".ts") ? specifier : `${specifier}.ts`));
    },
  });
  cache.set(absolute, moduleObject.exports);
  return moduleObject.exports;
}

const { PROP_THOUGHTS } = loadTs("src/data/propThoughts.ts");
const apt = loadTs("src/data/apartment.gameplay.ts");
const bak = loadTs("src/data/bakery.gameplay.ts");
const str = loadTs("src/data/street.gameplay.ts");
const mkt = loadTs("src/data/market.gameplay.ts");
const ending = loadTs("src/data/ending.ts");

/** Every gameplay zone attachGameplay/MarketGameplay registers, from the same data they read. */
const GAMEPLAY_ZONES = {
  PaninisFlat: Object.entries(loadTs("src/data/paninis-flat.gameplay.ts").PANINIS_ZONES).map(([id, z]) => ({ id, ...z })),
  Apartment: [
    { id: "michell-desk", ...apt.MICHELL_POSITION, radius: apt.MICHELL_INTERACT_RADIUS },
    { id: "michell-window", x: apt.MICHELL_WINDOW_ZONE.x, y: apt.MICHELL_WINDOW_ZONE.y, radius: apt.MICHELL_WINDOW_ZONE.radius },
    { id: "michell-table", x: ending.MICHELL_AT_TABLE.x, y: ending.MICHELL_AT_TABLE.y + 4, radius: 44 },
    { id: "rafa", ...apt.RAFA_POSITION, radius: 40 },
  ],
  Bakery: [
    { id: "teddy", ...bak.TEDDY_POSITION, radius: bak.TEDDY_INTERACT_RADIUS },
    ...bak.HIDING_SPOTS.map((s) => ({ id: `hiding:${s.id}`, x: s.x, y: s.y, radius: bak.HIDING_SPOT_INTERACT_RADIUS })),
  ],
  Street: [{ id: "window-box", x: str.WINDOW_BOX.zone.x, y: str.WINDOW_BOX.zone.y, radius: str.WINDOW_BOX.zone.radius }],
  Market: [
    { id: "pierre", x: mkt.PIERRE.x, y: mkt.PIERRE.y, radius: mkt.PIERRE.radius },
    { id: "market-gate", x: mkt.GATE.x, y: mkt.GATE.y, radius: mkt.GATE.radius },
    ...Object.entries(mkt.MEMORY_BASKETS).map(([k, b]) => ({ id: `basket:${k}`, x: b.x, y: b.y, radius: 44 })),
    ...mkt.SUGAR_CUBES.map((c) => ({ id: `sugar:${c.id}`, x: c.x, y: c.y, radius: mkt.SUGAR_PICKUP_TUNING.interactRadius })),
  ],
};

const SCENE_SOURCE = {
  PaninisFlat: readFileSync("src/scenes/PaninisFlat.ts", "utf8"),
  Apartment: readFileSync("src/scenes/Apartment.ts", "utf8"),
  Bakery: readFileSync("src/scenes/Bakery.ts", "utf8"),
  Street: readFileSync("src/scenes/Street.ts", "utf8"),
  Market: readFileSync("src/scenes/Market.ts", "utf8"),
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ids = new Set();
for (const [scene, thoughts] of Object.entries(PROP_THOUGHTS)) {
  assert.ok(GAMEPLAY_ZONES[scene], `unknown scene ${scene}`);
  for (const thought of thoughts) {
    assert.ok(!ids.has(thought.id), `duplicate thought id ${thought.id}`);
    ids.add(thought.id);
    assert.ok(thought.first.length >= 1, `${thought.id} has no lines`);
    // Not centred inside any gameplay zone, and no gameplay zone centred inside it: the player
    // standing at either zone's own point must not be offered the other one.
    for (const zone of GAMEPLAY_ZONES[scene]) {
      const d = dist(thought, zone);
      assert.ok(d > zone.radius, `${scene}: thought "${thought.id}" (${thought.x},${thought.y}) sits inside gameplay zone "${zone.id}" (r${zone.radius}, ${d.toFixed(0)}px away)`);
      assert.ok(d > thought.radius, `${scene}: gameplay zone "${zone.id}" sits inside thought "${thought.id}" (r${thought.radius}, ${d.toFixed(0)}px away)`);
    }
    // Thoughts don't overlap each other at all.
    for (const other of thoughts) {
      if (other === thought) continue;
      assert.ok(dist(thought, other) > thought.radius + other.radius, `${scene}: thoughts "${thought.id}" and "${other.id}" overlap`);
    }
    // A texture key must name an image the generated scene actually places.
    if (thought.textureKey) {
      assert.ok(SCENE_SOURCE[scene].includes(`"${thought.textureKey}"`), `${scene}: thought "${thought.id}" texture ${thought.textureKey} is not placed by src/scenes/${scene}.ts`);
    }
  }
}
// A thought must never claim a hiding-spot container as its tap target (it would sit on top of
// the hidden item's own 40px target and intercept the tap).
for (const spot of bak.HIDING_SPOTS) {
  for (const tex of [spot.containerTexture, spot.artTexture]) {
    if (!tex) continue;
    for (const thought of PROP_THOUGHTS.Bakery) assert.notEqual(thought.textureKey, tex, `thought ${thought.id} uses hiding spot ${spot.id}'s texture`);
  }
  // And the art a spot names must be a real placed image, or touch silently falls back to the square.
  if (spot.artTexture) assert.ok(SCENE_SOURCE.Bakery.includes(`"${spot.artTexture}"`), `hiding spot ${spot.id} art ${spot.artTexture} is not placed by Bakery.ts`);
}

console.log("prop-thoughts.test.mjs: all assertions passed");

// The noticeboard stops pretending the birthday surprise is secret after the photo.
{
  const {registerPropThoughts}=loadTs('src/systems/propThoughts.ts');
  const zones=[];let cake=false,count=0,played;
  registerPropThoughts({children:{list:[]},add:{rectangle:()=>({})}},'Street',
    {addZone:zone=>zones.push(zone)}, {isActive:()=>false,play:lines=>played=lines},
    {flag:()=>cake,count:()=>count,bump:()=>count++},play=>play(),()=>{});
  const board=zones.find(z=>z.id==='thought:noticeboard');
  board.onInteract();assert.ok(played.some(l=>l.text.includes('Still a secret')));
  cake=true;board.onInteract();assert.ok(played.some(l=>l.text.includes('accomplished')));
  assert.ok(played.every(l=>!l.text.includes('secret')));
  assert.equal(count,2,'notebook identity and counts are unchanged');
}
