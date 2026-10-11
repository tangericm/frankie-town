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

const gameplay = loadTs("src/data/market.gameplay.ts");
const { GameState } = loadTs("src/systems/GameState.ts");
const pickupSource = readFileSync("src/systems/market/SugarPickup.ts", "utf8");
const coordinatorSource = readFileSync("src/systems/market/MarketGameplay.ts", "utf8");

assert.deepEqual(JSON.parse(JSON.stringify(gameplay.SUGAR_CUBES.map(({ id }) => id))), ["lane1", "lane2", "lane3"]);
assert.equal(new Set(gameplay.SUGAR_CUBES.map(({ texture }) => texture)).size, 3);

const state = new GameState();
for (const id of ["lane1", "lane1", "lane2", "lane3"]) state.collectMarketSugarCube(id);
assert.equal(state.marketSugarCubeCount(), 3, "each authored cube persists once");
const restored = GameState.fromJSON(JSON.parse(JSON.stringify(state.toJSON())));
for (const id of ["lane1", "lane2", "lane3"]) assert.equal(restored.hasMarketSugarCube(id), true);

assert.match(pickupSource, /collectMarketSugarCube\(this\.cube\.id\)[\s\S]*this\.onLaneClear\(\)/,
  "pickup persistence must happen before clearing the matching lane");
assert.match(pickupSource, /count === SUGAR_PROGRESS_LABELS\.length[\s\S]*addIngredient\(MARKET_REWARDS\.sugar\.ingredient\)/);
assert.match(coordinatorSource, /cube\.id !== "lane2" \|\| this\.memoryLane\.isRopeUsable\(\)/);
for (const lane of ["pigeonLane", "memoryLane", "cartLane"]) {
  assert.match(coordinatorSource, new RegExp(`this\\.${lane}\\.clearPermanently\\(\\)`));
}

// Break caught: each bakery hiding spot's interact zone was anchored on the furniture's ART centre,
// but Frankie's position is her feet and the furniture's COLLIDER is what decides how close those
// feet can get. The chair's anchor sat 11px east of its own collider, putting it 41px from the only
// spot she can stand on its west side -- outside a 32px radius entirely. It read as "the pickup
// hitbox is kind of north of the actual object".
{
  const bakeryData = readFileSync("src/data/bakery.gameplay.ts", "utf8");
  // Each spot's own static collider, read off the live scene (see scripts/tests/manual checks).
  const colliders = {
    "wicker-basket": { x: 94, y: 196, width: 31, height: 21 },
    chair: { x: 144, y: 258, width: 31, height: 21 },
    plant: { x: 392, y: 306, width: 31, height: 21 },
  };
  const radius = Number(bakeryData.match(/HIDING_SPOT_INTERACT_RADIUS = (\d+)/)[1]);
  const frankieBody = { width: 28, height: 14 };
  const block = bakeryData.match(/export const HIDING_SPOTS[\s\S]*?\n\];/)[0];
  for (const [id, collider] of Object.entries(colliders)) {
    const entry = block.match(new RegExp(`id: "${id}", x: (\\d+), y: (\\d+)`));
    assert.ok(entry, `${id} must still be a hiding spot`);
    const spot = { x: Number(entry[1]), y: Number(entry[2]) };
    const centre = { x: collider.x + collider.width / 2, y: collider.y + collider.height / 2 };
    assert.ok(Math.abs(spot.x - centre.x) <= 1 && Math.abs(spot.y - centre.y) <= 1, `${id}'s zone must sit on its own collider's centre, not its art centre`);
    // Where Frankie's centre ends up walking straight in from each side.
    const approaches = [
      Math.hypot(collider.width / 2 + frankieBody.width / 2, 0),   // west/east
      Math.hypot(0, collider.height / 2 + frankieBody.height / 2), // north/south
    ];
    for (const reach of approaches) {
      assert.ok(reach <= radius, `${id} must be reachable from a straight approach (${reach.toFixed(1)}px vs radius ${radius})`);
    }
  }
}

console.log("market-pickups.test.mjs: all assertions passed");
