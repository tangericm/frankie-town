import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import tsCompiler from "typescript";

const src = readFileSync("src/systems/GameState.ts", "utf8");
const js = tsCompiler.transpileModule(src, {
  compilerOptions: { module: tsCompiler.ModuleKind.CommonJS, target: tsCompiler.ScriptTarget.ES2020 },
}).outputText;

const moduleObj = { exports: {} };
runInNewContext(js, { module: moduleObj, exports: moduleObj.exports, require: () => ({}) });
const { GameState } = moduleObj.exports;

// Fresh state starts empty.
{
  const state = new GameState();
  assert.equal(state.hasSeenIntro(), false);
  assert.equal(state.hasStartedErrand(), false);
  assert.equal(state.hasIngredient("flour"), false);
  assert.equal(state.bakeryItemsCollectedCount(), 0);
  assert.equal(state.hasMetPierre(), false);
  assert.equal(state.isMarketGateOpen(), false);
  assert.equal(state.isMarketHenHomed("hen-a"), false);
  assert.equal(state.marketHensHomedCount(), 0);
  assert.equal(state.hasMarketSugarCube("cube-a"), false);
  assert.equal(state.marketSugarCubeCount(), 0);
  assert.equal(state.isMarketMemorySolved(), false);
  assert.deepEqual(JSON.parse(JSON.stringify(state.toJSON().market)), {
    pierreIntroduced: false,
    gateOpened: false,
    homedHenIds: [],
    sugarCubeIds: [],
    memorySolved: false,
  });
}

// Market progress transitions independently, and repeating a completed transition neither
// changes the counts nor notifies listeners again.
{
  const state = new GameState();
  let calls = 0;
  state.onChange(() => { calls += 1; });

  state.markPierreMet();
  state.markPierreMet();
  assert.equal(state.hasMetPierre(), true);
  assert.equal(calls, 1);

  state.openMarketGate();
  state.openMarketGate();
  assert.equal(state.isMarketGateOpen(), true);
  assert.equal(calls, 2);

  state.homeMarketHen("hen-a");
  state.homeMarketHen("hen-a");
  state.homeMarketHen("hen-b");
  assert.equal(state.isMarketHenHomed("hen-a"), true);
  assert.equal(state.isMarketHenHomed("hen-c"), false);
  assert.equal(state.marketHensHomedCount(), 2);
  assert.equal(calls, 4);

  state.collectMarketSugarCube("cube-a");
  state.collectMarketSugarCube("cube-a");
  state.collectMarketSugarCube("cube-b");
  assert.equal(state.hasMarketSugarCube("cube-a"), true);
  assert.equal(state.hasMarketSugarCube("cube-c"), false);
  assert.equal(state.marketSugarCubeCount(), 2);
  assert.equal(calls, 6);
}

// revealIngredient is idempotent and only notifies on the transition to true; unrevealed ids
// stay unrevealed independently.
{
  const state = new GameState();
  let calls = 0;
  state.onChange(() => { calls += 1; });
  assert.equal(state.isIngredientRevealed("flour"), false);
  state.revealIngredient("flour");
  state.revealIngredient("flour");
  assert.equal(state.isIngredientRevealed("flour"), true);
  assert.equal(state.isIngredientRevealed("eggs"), false);
  assert.equal(calls, 1);
}

// getHidingSpotAssignment maps every item to one of the given spots, with no repeats, and
// caches the result -- a second call with the same lists returns the identical assignment
// rather than reshuffling.
{
  const state = new GameState();
  const items = ["whisk", "oven-mitt", "measuring-cup"];
  const spots = ["wicker-basket", "flour-sacks", "counter-basket"];
  const assignment = state.getHidingSpotAssignment(items, spots);
  assert.deepEqual(Object.keys(assignment).sort(), [...items].sort());
  assert.deepEqual([...spots].sort(), Object.values(assignment).sort());
  const again = state.getHidingSpotAssignment(items, spots);
  assert.deepEqual(again, assignment);
}

// startErrand is idempotent and only notifies on the transition to true.
{
  const state = new GameState();
  let calls = 0;
  state.onChange(() => { calls += 1; });
  state.startErrand();
  state.startErrand();
  assert.equal(state.hasStartedErrand(), true);
  assert.equal(calls, 1);
}

// Existing flags and inventory track independently, and duplicate mutator calls do not notify.
{
  const state = new GameState();
  let calls = 0;
  state.onChange(() => { calls += 1; });
  state.markIntroSeen();
  state.markIntroSeen();
  assert.equal(state.hasSeenIntro(), true);
  assert.equal(calls, 1);

  state.addIngredient("flour");
  state.addIngredient("flour");
  assert.equal(state.hasIngredient("flour"), true);
  assert.equal(state.hasIngredient("sugar"), false);
  assert.equal(calls, 2);

  state.collectBakeryItem("whisk");
  state.collectBakeryItem("eggs-basket");
  state.collectBakeryItem("whisk");
  assert.equal(state.bakeryItemsCollectedCount(), 2);
  assert.equal(state.hasBakeryItem("whisk"), true);
  assert.equal(state.hasBakeryItem("sugar-sack"), false);
  assert.equal(calls, 4);
}

// markEndingSeen is idempotent and only notifies on the transition to true.
{
  const state = new GameState();
  let calls = 0;
  state.onChange(() => { calls += 1; });
  assert.equal(state.hasSeenEnding(), false);
  state.markEndingSeen();
  state.markEndingSeen();
  assert.equal(state.hasSeenEnding(), true);
  assert.equal(calls, 1);
}

// toJSON/fromJSON round-trips every field, including Sets, without notifying (load is not
// player-driven progress).
{
  const state = new GameState();
  state.markIntroSeen();
  state.markEndingSeen();
  state.startErrand();
  state.addIngredient("flour");
  state.collectBakeryItem("whisk");
  state.revealIngredient("flour");
  state.getHidingSpotAssignment(["whisk"], ["wicker-basket"]);
  state.markPierreMet();
  state.openMarketGate();
  state.homeMarketHen("hen-a");
  state.homeMarketHen("hen-b");
  state.collectMarketSugarCube("cube-a");
  state.collectMarketSugarCube("cube-b");
  state.markMarketMemorySolved();
  state.addIngredient("eggs");
  state.addIngredient("sugar");

  const snapshot = JSON.parse(JSON.stringify(state.toJSON()));
  assert.deepEqual(snapshot.ingredients, ["flour", "eggs", "sugar"]);
  assert.deepEqual(snapshot.market, {
    pierreIntroduced: true,
    gateOpened: true,
    homedHenIds: ["hen-a", "hen-b"],
    sugarCubeIds: ["cube-a", "cube-b"],
    memorySolved: true,
  });
  assert.equal("lane1Cleared" in snapshot.market, false);
  assert.equal("lane2Cleared" in snapshot.market, false);
  assert.equal("lane3Cleared" in snapshot.market, false);
  assert.equal("eggsAwarded" in snapshot.market, false);
  assert.equal("sugarAwarded" in snapshot.market, false);

  let loadNotifications = 0;
  const realNotify = GameState.prototype.notify;
  GameState.prototype.notify = function () {
    loadNotifications += 1;
    return realNotify.call(this);
  };
  let restored;
  try {
    restored = GameState.fromJSON(snapshot);
  } finally {
    GameState.prototype.notify = realNotify;
  }
  assert.equal(loadNotifications, 0);
  assert.equal(restored.hasSeenIntro(), true);
  assert.equal(restored.hasSeenEnding(), true);
  assert.equal(restored.hasStartedErrand(), true);
  assert.equal(restored.hasIngredient("flour"), true);
  assert.equal(restored.hasBakeryItem("whisk"), true);
  assert.equal(restored.isIngredientRevealed("flour"), true);
  assert.deepEqual(restored.getHidingSpotAssignment(["whisk"], ["wicker-basket"]), { whisk: "wicker-basket" });
  assert.equal(restored.hasMetPierre(), true);
  assert.equal(restored.isMarketGateOpen(), true);
  assert.equal(restored.isMarketHenHomed("hen-a"), true);
  assert.equal(restored.marketHensHomedCount(), 2);
  assert.equal(restored.hasMarketSugarCube("cube-b"), true);
  assert.equal(restored.marketSugarCubeCount(), 2);
  assert.equal(restored.hasIngredient("eggs"), true);
  assert.equal(restored.hasIngredient("sugar"), true);

  // A GameState that never touched any of these stays falsy/empty through the round-trip too.
  const empty = GameState.fromJSON(JSON.parse(JSON.stringify(new GameState().toJSON())));
  assert.equal(empty.hasSeenIntro(), false);
  assert.equal(empty.hasIngredient("flour"), false);
}

// A pre-Market snapshot preserves every old field and safely defaults the missing Market object.
{
  const legacy = {
    introSeen: true,
    endingSeen: false,
    errandStarted: true,
    ingredients: ["flour"],
    bakeryItemsCollected: ["whisk"],
    revealedIngredients: ["flour"],
    hidingSpotAssignments: null,
  };
  const restored = GameState.fromJSON(legacy);
  const snapshot = JSON.parse(JSON.stringify(restored.toJSON()));

  assert.equal(restored.hasSeenIntro(), true);
  assert.equal(restored.hasSeenEnding(), false);
  assert.equal(restored.hasStartedErrand(), true);
  assert.equal(restored.hasIngredient("flour"), true);
  assert.equal(restored.hasBakeryItem("whisk"), true);
  assert.equal(restored.isIngredientRevealed("flour"), true);
  assert.equal(snapshot.hidingSpotAssignments, null);
  assert.deepEqual(snapshot.market, {
    pierreIntroduced: false,
    gateOpened: false,
    homedHenIds: [],
    sugarCubeIds: [],
    memorySolved: false,
  });

  const sparse = GameState.fromJSON({});
  assert.equal(sparse.hasSeenIntro(), false);
  assert.equal(sparse.hasSeenEnding(), false);
  assert.equal(sparse.hasStartedErrand(), false);
  assert.equal(sparse.hasIngredient("flour"), false);
  assert.equal(sparse.hasBakeryItem("whisk"), false);
  assert.equal(sparse.isIngredientRevealed("flour"), false);
  assert.equal(sparse.hasMetPierre(), false);
  assert.equal(sparse.isMarketGateOpen(), false);
  assert.equal(sparse.marketHensHomedCount(), 0);
  assert.equal(sparse.marketSugarCubeCount(), 0);

  // A partially populated nested snapshot preserves supplied values while independently
  // defaulting its missing boolean and ID-array fields.
  const partialMarket = GameState.fromJSON({
    market: {
      pierreIntroduced: true,
      homedHenIds: ["hen-a"],
    },
  });
  assert.equal(partialMarket.hasMetPierre(), true);
  assert.equal(partialMarket.isMarketGateOpen(), false);
  assert.equal(partialMarket.isMarketHenHomed("hen-a"), true);
  assert.equal(partialMarket.marketHensHomedCount(), 1);
  assert.equal(partialMarket.hasMarketSugarCube("cube-a"), false);
  assert.equal(partialMarket.marketSugarCubeCount(), 0);
}

// Listeners fire on every real state transition and can unsubscribe.
{
  const state = new GameState();
  let calls = 0;
  const listener = () => { calls += 1; };
  state.onChange(listener);
  state.markIntroSeen();
  state.addIngredient("flour");
  assert.equal(calls, 2);
  state.offChange(listener);
  state.addIngredient("sugar");
  assert.equal(calls, 2);
}

// A throwing listener must not stop the others, and a listener that unsubscribes itself mid-notify
// must not cause the next one to be skipped. Regression cover for the bakery softlock: a leaked
// listener from a shut-down scene threw inside notify(), which aborted the remaining listeners and
// left the errand's item zones unregistered -- Teddy asked for items that did not exist.
{
  const state = new GameState();
  const order = [];
  const first = () => { order.push("first"); throw new Error("boom"); };
  const second = () => { order.push("second"); state.offChange(second); };
  const third = () => { order.push("third"); };
  state.onChange(first);
  state.onChange(second);
  state.onChange(third);

  const realError = console.error;
  console.error = () => {};
  try {
    state.markIntroSeen();
  } finally {
    console.error = realError;
  }
  // "third" is the assertion that matters: it runs even though "first" threw and "second"
  // unsubscribed itself while notify() was walking the list.
  assert.deepEqual(order, ["first", "second", "third"]);

  order.length = 0;
  console.error = () => {};
  try {
    state.addIngredient("flour");
  } finally {
    console.error = realError;
  }
  assert.deepEqual(order, ["first", "third"]);
}


// Break caught (BLOCKER): the assignment map is persisted, so a save can name hiding spots that no
// longer exist. The scene looks each one up with a non-null assertion, so an unknown id threw during
// create() and left the player on the loading screen forever, on every reload, with no in-game way
// to clear the save. A stale map must be discarded and reshuffled instead of trusted.
{
  const stale = GameState.fromJSON({
    errandStarted: true,
    hidingSpotAssignments: { "wooden-spoon": "crate", "oven-mitt": "flour-sack", "measuring-cup": "barrel" },
  });
  const spots = ["wicker-basket", "chair", "plant"];
  const items = ["wooden-spoon", "oven-mitt", "measuring-cup"];
  const assignment = stale.getHidingSpotAssignment(items, spots);
  for (const item of items) {
    assert.ok(spots.includes(assignment[item]), `${item} must be assigned to a spot that still exists`);
  }
  assert.equal(new Set(items.map((id) => assignment[id])).size, items.length, "every item must get its own spot");
  // A partially-stale map is just as fatal, and so is a duplicate.
  const partial = GameState.fromJSON({ hidingSpotAssignments: { "wooden-spoon": "chair", "oven-mitt": "gone", "measuring-cup": "plant" } });
  assert.ok(spots.includes(partial.getHidingSpotAssignment(items, spots)["oven-mitt"]));
  const dupe = GameState.fromJSON({ hidingSpotAssignments: { "wooden-spoon": "chair", "oven-mitt": "chair", "measuring-cup": "plant" } });
  const fixed = dupe.getHidingSpotAssignment(items, spots);
  assert.equal(new Set(items.map((id) => fixed[id])).size, items.length, "a map that hides two items in one spot must be reshuffled");
  // A still-valid map is left exactly as it is -- re-entering the bakery must not move a
  // half-found errand's items around.
  const good = { "wooden-spoon": "plant", "oven-mitt": "wicker-basket", "measuring-cup": "chair" };
  assert.deepEqual(GameState.fromJSON({ hidingSpotAssignments: { ...good } }).getHidingSpotAssignment(items, spots), good);
}

// Break caught: solving the memory booth was recorded ONLY by picking up the sugar cube behind its
// rope, so leaving the market (or reloading) in between threw the solve away and re-armed all three
// rounds. The flag is separate now -- and a save written before it existed still counts the cube as
// proof of the solve, since that cube is unreachable without it.
{
  const solved = new GameState();
  solved.markMarketMemorySolved();
  assert.equal(solved.isMarketMemorySolved(), true);
  assert.equal(solved.hasMarketSugarCube("lane2"), false, "the solve must not imply the pickup");

  const legacy = GameState.fromJSON({ market: { sugarCubeIds: ["lane2"] } });
  assert.equal(legacy.isMarketMemorySolved(), true, "an old save that has the cube must count as solved");
  const untouched = GameState.fromJSON({ market: { sugarCubeIds: [] } });
  assert.equal(untouched.isMarketMemorySolved(), false);
}


// Generic flags and counters (ending, prop thoughts, random events, window box) round-trip
// through the save and start empty on a save written before they existed.
{
  const state = new GameState();
  let calls = 0;
  state.onChange(() => { calls += 1; });
  assert.equal(state.flag("bakeDone"), false);
  assert.equal(state.count("windowBoxWatered"), 0);
  state.setFlag("bakeDone");
  state.setFlag("bakeDone");
  assert.equal(state.flag("bakeDone"), true);
  assert.equal(calls, 1, "setting a flag twice notifies once");
  assert.equal(state.bump("windowBoxWatered"), 1);
  assert.equal(state.bump("windowBoxWatered", 2), 3);
  assert.equal(state.count("windowBoxWatered"), 3);
  assert.equal(state.count("propSeen:sofa"), 0);
  state.bump("propSeen:sofa");
  const saved = JSON.parse(JSON.stringify(state.toJSON()));
  assert.deepEqual(saved.flags, ["bakeDone"]);
  assert.deepEqual(saved.counts, { windowBoxWatered: 3, "propSeen:sofa": 1 });
  const loaded = GameState.fromJSON(saved);
  assert.equal(loaded.flag("bakeDone"), true);
  assert.equal(loaded.flag("cakeGiven"), false);
  assert.equal(loaded.count("windowBoxWatered"), 3);
  const legacy = GameState.fromJSON({ market: { sugarCubeIds: [] } });
  assert.equal(legacy.flag("bakeDone"), false);
  assert.equal(legacy.count("windowBoxWatered"), 0);
  assert.deepEqual(JSON.parse(JSON.stringify(legacy.toJSON())).flags, []);
}

console.log("game-state.test.mjs: all assertions passed");

// URL reset must drop both the registry singleton and every persisted notebook counter.
{
 const storage=new Map();const registry=new Map();const exported={exports:{}};
 runInNewContext(js,{module:exported,exports:exported.exports,require:()=>({}),localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
 const scene={game:{registry:{get:k=>registry.get(k),set:(k,v)=>registry.set(k,v),remove:k=>registry.delete(k)}}};
 const {getGameState,clearSavedState}=exported.exports;
 const old=getGameState(scene);old.bump('propSeen:fern');old.bump('windowBoxWatered');old.setFlag('cakeGiven');
 clearSavedState(scene);const fresh=getGameState(scene);
 assert.notEqual(fresh,old);assert.equal(fresh.countKeys('propSeen:').length,0);assert.equal(fresh.count('windowBoxWatered'),0);assert.equal(fresh.flag('cakeGiven'),false);
 assert.equal(storage.has('frankie:save'),false);
}

// Persisted JSON is an untrusted boundary: malformed collections/booleans cannot unlock quests.
{
 const state=GameState.fromJSON({introSeen:"yes",endingSeen:1,ingredients:"flour",bakeryItemsCollected:[null,42,"whisk"],market:{homedHenIds:"hen",sugarCubeIds:4,memorySolved:"yes"},flags:[null,"dinnerPlush"],counts:{bad:Infinity,fraction:1.2,negative:-1,valid:2}});
 assert.equal(state.hasSeenIntro(),false);assert.equal(state.hasSeenEnding(),false);assert.equal(state.hasIngredient("flour"),false);assert.equal(state.marketHensHomedCount(),0);assert.equal(state.count("bad"),0);assert.equal(state.count("valid"),2);assert.equal(state.flag("dinnerPlush"),false,"old dinner inspections migrate to the new errand");
 assert.equal(GameState.fromJSON(null).hasSeenIntro(),false);
 assert.equal(GameState.fromJSON({version:999,introSeen:true}).hasSeenIntro(),false);
}

// An older client must never overwrite progress saved by a newer game release.
{
 const storage=new Map([['frankie:save',JSON.stringify({version:999,introSeen:true,futureQuest:'keep me'})]]);
 const registry=new Map();const exported={exports:{}};
 runInNewContext(js,{module:exported,exports:exported.exports,require:()=>({}),localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
 const scene={game:{registry:{get:k=>registry.get(k),set:(k,v)=>registry.set(k,v),remove:k=>registry.delete(k)}}};
 const raw=storage.get('frankie:save');
 exported.exports.getGameState(scene).markIntroSeen();
 assert.equal(storage.get('frankie:save'),raw,'unsupported raw save survives ordinary progress');
 assert.equal(exported.exports.hasSavedProgress(),false,'unsupported progress cannot offer an ordinary Continue');
 assert.equal(exported.exports.hasUnsupportedSave(),true);
 exported.exports.clearSavedState(scene);
 assert.equal(exported.exports.hasUnsupportedSave(),false);
 exported.exports.getGameState(scene).markIntroSeen();
 assert.equal(JSON.parse(storage.get('frankie:save')).version,2,'explicit reset enables normal persistence');
}
