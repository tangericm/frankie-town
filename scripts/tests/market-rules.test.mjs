import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import tsCompiler from "typescript";

const moduleCache = new Map();

function loadTypeScriptModule(filename) {
  const absolute = path.resolve(filename);
  if (moduleCache.has(absolute)) return moduleCache.get(absolute);

  const source = readFileSync(absolute, "utf8");
  const javascript = tsCompiler.transpileModule(source, {
    compilerOptions: {
      module: tsCompiler.ModuleKind.CommonJS,
      target: tsCompiler.ScriptTarget.ES2020,
    },
  }).outputText;
  const moduleObject = { exports: {} };
  moduleCache.set(absolute, moduleObject.exports);
  runInNewContext(javascript, {
    module: moduleObject,
    exports: moduleObject.exports,
    require(specifier) {
      assert.ok(specifier.startsWith("."), `pure Market modules must not load ${specifier}`);
      const resolved = path.resolve(path.dirname(absolute), specifier.endsWith(".ts") ? specifier : `${specifier}.ts`);
      return loadTypeScriptModule(resolved);
    },
  });
  moduleCache.set(absolute, moduleObject.exports);
  return moduleObject.exports;
}

const gameplay = loadTypeScriptModule("src/data/market.gameplay.ts");
const rules = loadTypeScriptModule("src/systems/market/marketRules.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));

// Break caught: reversing or failing to normalize the flee vector lets a hen run toward Frankie
// or move at a tuning-dependent speed.
{
  const velocity = rules.fleeVelocity({ x: 4, y: 6 }, { x: 1, y: 2 }, 10);
  assert.deepEqual(plain(velocity), { x: 6, y: 8 });
  assert.ok(velocity.x * 3 + velocity.y * 4 > 0, "velocity must point along hen - Frankie");
  assert.ok(Math.abs(Math.hypot(velocity.x, velocity.y) - 10) < 1e-9);

  const fallback = rules.fleeVelocity({ x: 7, y: 9 }, { x: 7, y: 9 }, 68);
  assert.deepEqual(plain(fallback), { x: 68, y: 0 });
  assert.ok(Number.isFinite(fallback.x) && Number.isFinite(fallback.y));
}

// Break caught: accepting any rectangle overlap would home a hen through a wall instead of the
// configured doorway edge.
{
  const cases = [
    { entry: "north", previous: { x: 20, y: 9 }, current: { x: 20, y: 11 } },
    { entry: "south", previous: { x: 20, y: 31 }, current: { x: 20, y: 29 } },
    { entry: "east", previous: { x: 31, y: 20 }, current: { x: 29, y: 20 } },
    { entry: "west", previous: { x: 9, y: 20 }, current: { x: 11, y: 20 } },
  ];
  for (const testCase of cases) {
    const goal = { x: 10, y: 10, width: 20, height: 20, entry: testCase.entry };
    assert.equal(rules.enteredGoal(testCase.previous, testCase.current, goal), true, `${testCase.entry} doorway must admit entry`);
    assert.equal(rules.enteredGoal({ x: 5, y: 20 }, { x: 11, y: 20 }, goal), testCase.entry === "west");
    assert.equal(rules.enteredGoal({ x: 20, y: 20 }, { x: 21, y: 21 }, goal), false, "movement already inside is not a new entry");
    assert.equal(rules.enteredGoal(testCase.previous, testCase.previous, goal), false, "movement ending outside cannot home a hen");
  }

  assert.equal(
    rules.enteredGoal(
      { x: 113, y: 663 },
      { x: 111, y: 661 },
      { x: 100, y: 642, width: 12, height: 20, entry: "south" },
    ),
    true,
    "diagonal entry is judged where the segment crosses the doorway edge",
  );
}

// Break caught: changing sequence advancement can skip a symbol, erase a completed round, or
// complete before all 3/4/5 authored symbols have been entered.
{
  assert.deepEqual(plain(gameplay.MEMORY_ROUNDS.map((round) => round.length)), [3, 4, 5]);
  let attempt = { round: 0, cursor: 0, complete: false };
  for (let round = 0; round < gameplay.MEMORY_ROUNDS.length; round += 1) {
    const sequence = gameplay.MEMORY_ROUNDS[round];
    for (let cursor = 0; cursor < sequence.length; cursor += 1) {
      const result = rules.enterMemorySymbol(attempt, sequence[cursor]);
      const finalSymbol = cursor === sequence.length - 1;
      const finalRound = round === gameplay.MEMORY_ROUNDS.length - 1;
      assert.equal(result.status, !finalSymbol ? "accepted" : finalRound ? "complete" : "round-complete");
      attempt = plain(result.attempt);
    }
    if (round < gameplay.MEMORY_ROUNDS.length - 1) {
      assert.deepEqual(attempt, { round: round + 1, cursor: 0, complete: false });
    }
  }
  assert.deepEqual(attempt, { round: 2, cursor: 5, complete: true });

  const afterRoundOne = { round: 1, cursor: 2, complete: false };
  const expected = gameplay.MEMORY_ROUNDS[1][2];
  const wrong = gameplay.MARKET_SYMBOLS.find((symbol) => symbol !== expected);
  const replay = rules.enterMemorySymbol(afterRoundOne, wrong);
  assert.equal(replay.status, "replay");
  assert.deepEqual(plain(replay.attempt), { round: 1, cursor: 0, complete: false });
}

// Hen panic uses hysteresis so hovering around the inner radius cannot rapidly alternate
// idle/run, and fence clamping always returns a point inside the authored yard.
{
  assert.equal(rules.nextHenMode("idle", 58, 58, 76), "flee");
  assert.equal(rules.nextHenMode("flee", 70, 58, 76), "flee");
  assert.equal(rules.nextHenMode("flee", 76, 58, 76), "idle");
  assert.equal(rules.nextHenMode("homed", 0, 58, 76), "homed");
  assert.deepEqual(
    plain(rules.clampPoint({ x: -40, y: 999 }, { x: 10, y: 20, width: 30, height: 40 })),
    { x: 10, y: 60 },
  );
}

// Break caught: shortening an empty interval below touch crossing time makes a lane impossible to
// read and cross safely; marking any non-travel phase hazardous defeats the telegraph.
{
  const pigeonMinimum = gameplay.LANE1.crossingDepth / gameplay.MARKET_PLAYER_SPEED * 1000
    + gameplay.TOUCH_CROSSING_MARGIN_MS;
  const pigeonGap = rules.pigeonGapMs(
    gameplay.LANE1.crossingDepth,
    gameplay.MARKET_PLAYER_SPEED,
    gameplay.TOUCH_CROSSING_MARGIN_MS,
  );
  assert.ok(pigeonGap >= pigeonMinimum);
  assert.ok(gameplay.PIGEON_PHASES.find((phase) => phase.phase === "gap").durationMs >= pigeonGap);
  // Expressed as a speed, not a duration. The old ">= 1500ms" rule was written when the lane ran
  // edge to edge (416px); once the routes were bounded to the open lane (253px) the same duration
  // meant a pigeon slower than a walking cart, and the whole cycle spent longer winding up than
  // crossing ("the pigeons are a little bit too easy to go past"). What actually matters is that a
  // dart reads as a dash you have to time rather than a teleport you cannot.
  const dartSpeed = (gameplay.LANE1.stageRight - gameplay.LANE1.stageLeft)
    / (gameplay.PIGEON_PHASES.find((phase) => phase.phase === "dart").durationMs / 1000);
  assert.ok(
    dartSpeed > gameplay.MARKET_PLAYER_SPEED * 2 && dartSpeed < gameplay.MARKET_PLAYER_SPEED * 3.5,
    `dart must cross faster than Frankie walks but still be dodgeable (${dartSpeed.toFixed(0)}px/s vs his ${gameplay.MARKET_PLAYER_SPEED})`,
  );
  assert.deepEqual(
    plain(gameplay.PIGEON_PHASES.filter((phase) => rules.isPigeonPhaseHazardous(phase.phase)).map((phase) => phase.phase)),
    ["dart"],
  );

  const CART_ART_HEIGHT = gameplay.CART_ART_BOUNDS.bottom - gameplay.CART_ART_BOUNDS.top;
  const cartMinimum = gameplay.CART_CROSSING_DEPTH / gameplay.MARKET_PLAYER_SPEED * 1000
    + gameplay.TOUCH_CROSSING_MARGIN_MS;
  const cartPhases = plain(gameplay.CART_PHASES);
  // The gap is the one window the lane promises is safe, so it still has to hold a whole crossing
  // plus touch margin -- the return pass made mistiming punishing, it must not have made a correct
  // crossing impossible.
  assert.ok(cartPhases.find((phase) => phase.phase === "gap").durationMs >= cartMinimum);
  // The warning that follows that gap is the invitation to cross, and needs enough notice to read.
  const afterGap = cartPhases[(cartPhases.findIndex((phase) => phase.phase === "gap") + 1) % cartPhases.length];
  assert.equal(afterGap.phase, "warning");
  assert.ok(afterGap.durationMs >= 900, "the warning that follows the safe gap must be readable");
  // Two crossings per cycle, out and back. One crossing per cycle put the cart in the way of the
  // column Frankie crosses on for only ~400ms out of 4400 and the lane was not a timing challenge
  // at all (10/10 scripted crossings, including both worst phase boundaries).
  assert.equal(cartPhases.filter((phase) => phase.phase === "crossing").length, 2, "the cart must cross out and back within one cycle");
  // ...and the turnaround between them must be short enough that following the cart out is a
  // mistake, not a second safe window. A full crossing of the lane takes longer than the cart needs
  // to be back at Frankie's column.
  const turnaround = cartPhases[cartPhases.findIndex((phase) => phase.phase === "crossing") + 1];
  assert.equal(turnaround.phase, "warning");
  assert.ok(
    turnaround.durationMs < gameplay.CART_CROSSING_DEPTH / gameplay.MARKET_PLAYER_SPEED * 1000,
    "the turnaround must be shorter than a full crossing, or stepping out behind the cart is safe",
  );
  assert.deepEqual(
    [...new Set(cartPhases.filter((phase) => rules.isCartPhaseHazardous(phase.phase)).map((phase) => phase.phase))],
    ["crossing"],
  );
  // The cart's hazard box is its painted body, not a guess. The old 40x24 was 20px narrower than
  // the art, so the visible wheels rolled over Frankie without the overlap firing.
  assert.equal(gameplay.CART_TUNING.body.width, gameplay.CART_ART_BOUNDS.right - gameplay.CART_ART_BOUNDS.left);
  assert.ok(gameplay.CART_TUNING.body.height <= CART_ART_HEIGHT, "the cart body must not exceed its own painted height");
}


// ...and the trigger has to actually contain the spot the minigame makes him stand on to answer
// (the baskets' own interact range) while staying clear of lane 1's sugar cube to the south.
{
	const trigger = plain(gameplay.MEMORY_LANE_TRIGGER);
	const inside = (x, y) => x >= trigger.x && x <= trigger.x + trigger.width && y >= trigger.y && y <= trigger.y + trigger.height;
	for (const [symbol, basket] of Object.entries(plain(gameplay.MEMORY_BASKETS))) {
		assert.ok(inside(basket.x, basket.y + 39), `the ${symbol} basket's own standing spot must be inside MEMORY_LANE_TRIGGER`);
	}
	const lane1Cube = plain(gameplay.SUGAR_CUBES).find((cube) => cube.id === "lane1");
	assert.ok(!inside(lane1Cube.x, lane1Cube.y), "standing at lane 1's sugar cube must not start the memory booth");
}

// Break caught: deriving all lanes from a total count would clear the wrong hazard when cubes are
// collected out of order.
{
  const collected = new Set(["lane2"]);
  assert.deepEqual(plain(gameplay.SUGAR_CUBES.map((cube) => cube.id)), ["lane1", "lane2", "lane3"]);
  assert.equal(new Set(gameplay.SUGAR_CUBES.map((cube) => cube.texture)).size, 3);
  assert.equal(rules.isLaneCleared(collected, "lane1"), false);
  assert.equal(rules.isLaneCleared(collected, "lane2"), true);
  assert.equal(rules.isLaneCleared(collected, "lane3"), false);
}

// Break caught: an invalid geometry/tuning edit can spawn hens outside their yard, reconstruct a
// homed hen outside the coop, or make flee hysteresis/speed impossible.
{
  for (const hen of gameplay.HEN_STARTS) {
    assert.equal(rules.pointInRect(hen, gameplay.HEN_BOUNDS), true, `${hen.id} must start in the yard`);
    assert.equal(rules.pointInRect(hen, gameplay.COOP_GOAL), false, `${hen.id} must not start homed`);
  }
  // Settle points are where a homed hen's sprite is tweened to *after* homing, with her body already
  // disabled -- so they belong on the coop's own painted entry ramp (x72-92, y620-662), behind the
  // sealed front face.
  for (const point of gameplay.HEN_SETTLE_POINTS) {
    assert.ok(point.x >= 72 && point.x <= 92, "homed hens must settle on the coop's own painted entry ramp");
    assert.ok(point.y >= 620 && point.y <= 662, "homed hens must settle inside the coop's own painted footprint");
    assert.ok(gameplay.henDepth(point.x, point.y) > gameplay.COOP_DEPTH, "a settling hen must stay drawn in front of the coop until she fades");
  }
  assert.ok(gameplay.HEN_TUNING.panicRadius < gameplay.HEN_TUNING.releaseRadius);
  assert.ok(gameplay.HEN_TUNING.fleeSpeed < gameplay.MARKET_PLAYER_SPEED);
  assert.ok(gameplay.HEN_TUNING.lateralJitterRatio <= 0.15);
}

// Break caught: the coop's north wall used to stop at the doorway lintel (y608), leaving the
// roof's own drawn silhouette (y543-608, see mkt-50bba3ae's opaque-pixel bounds) with no collider
// at all -- Frankie or a hen could walk straight onto/behind the coop. The wall must seal the whole
// structure, roof and front face, meeting with no seam and no opening.
{
  const [top, face] = gameplay.COOP_WALL_BLOCKERS;
  assert.equal(gameplay.COOP_WALL_BLOCKERS.length, 2, "the coop is a sealed roof band plus a sealed front face -- no doorway gap between posts");
  assert.equal(top.y, 543, "coop's north wall must start at the roof's own top edge, not the doorway lintel");
  assert.equal(top.y + top.height, face.y, "roof band must meet the front face with no gap");
  assert.equal(top.x, face.x, "roof band's left edge must align with the front face");
  assert.equal(top.x + top.width, face.x + face.width, "roof band's right edge must align with the front face");
}

// Break caught: sealing the coop's roof (above) turned a stretch of the yard just south of the
// wall into a dead-end against the pre-existing fence-post row -- a hen clamped in there by
// HEN_BOUNDS gets physically wedged with no pathfinding to route around. HEN_BOUNDS must never
// permit a y inside the sealed wall's own range, for any x the wall covers.
{
  const wallBottom = gameplay.COOP_WALL_BLOCKERS[0].y + gameplay.COOP_WALL_BLOCKERS[0].height;
  assert.ok(gameplay.HEN_BOUNDS.y >= wallBottom, "hens must never be clamped to a y inside the sealed coop wall");
}

// Break caught: the yard's other three edges sat exactly flush with the boundary fence (west
// column x13-44, east column x292-323, south row y763-784) -- a hen clamped to that exact edge
// still has half its own body overlapping the fence with nothing to push it back out, reading as
// stuck at the wall. Each edge must clear the fence by at least half the hen's own body dimension.
{
  const halfW = gameplay.HEN_TUNING.body.width / 2;
  const halfH = gameplay.HEN_TUNING.body.height / 2;
  const westFenceRight = 13 + 31;
  const eastFenceLeft = 292;
  const southFenceTop = 763;
  assert.ok(gameplay.HEN_BOUNDS.x >= westFenceRight + halfW, "west edge must clear the boundary fence by half a hen's body width");
  assert.ok(gameplay.HEN_BOUNDS.x + gameplay.HEN_BOUNDS.width <= eastFenceLeft - halfW, "east edge must clear the boundary fence by half a hen's body width");
  assert.ok(gameplay.HEN_BOUNDS.y + gameplay.HEN_BOUNDS.height <= southFenceTop - halfH, "south edge must clear the boundary fence by half a hen's body height");
}

// Break caught: Pierre's own stall counter (a separate, larger collider than his own NPC hitbox)
// keeps Frankie's body 57-62px away from PIERRE's center from every direction that was actually
// walked and measured live -- a radius at or below that means he can never be reached on foot,
// only via the dev debug hook, regardless of which side you approach from.
{
  const MEASURED_MIN_APPROACH_PX = 62;
  assert.ok(gameplay.PIERRE.radius > MEASURED_MIN_APPROACH_PX, "Pierre's interact radius must clear the counter's own minimum approach distance");
}

// Break caught: coordinate drift can reverse the south-to-north progression or leave a later
// controller without an authored route/staging point.
{
  const checkpoints = gameplay.LANE_CHECKPOINTS;
  assert.ok(checkpoints.lane1.y > checkpoints.lane2.y && checkpoints.lane2.y > checkpoints.lane3.y);
  for (const cube of gameplay.SUGAR_CUBES) {
    assert.ok(checkpoints[cube.id].y > cube.y, `${cube.id} checkpoint must remain south of its cube`);
  }
  assert.equal(gameplay.PIGEON_ROUTES.length, 5);
  for (const route of gameplay.PIGEON_ROUTES) {
    assert.equal(route.left.x, gameplay.LANE1.stageLeft);
    assert.equal(route.right.x, gameplay.LANE1.stageRight);
    assert.ok(route.left.y < gameplay.LANE1.checkpoint.y && route.left.y >= gameplay.LANE1.checkpoint.y - gameplay.LANE1.crossingDepth);
  }
  assert.ok(gameplay.LANE3.route.fromX < gameplay.LANE3.checkpoint.x);
  assert.ok(gameplay.LANE3.route.toX > gameplay.LANE3.checkpoint.x);
}

// Break caught: Pierre selecting by only one progress counter can replay the intro/reward or hide
// the active objective. These calls exercise the complete contextual selector, not source text.
{
  const base = { introduced: true, hensHomed: 0, sugarCubes: 0, hasEggs: false, hasSugar: false };
  const intro = rules.pierreDialogue({ ...base, introduced: false });
  assert.deepEqual(plain(intro), plain(gameplay.PIERRE_DIALOGUE.intro));
  assert.equal(intro[0].noise, undefined, "translation is only established in the apartment opening");
  for (let hensHomed = 0; hensHomed < 3; hensHomed++) {
    assert.deepEqual(plain(rules.pierreDialogue({ ...base, hensHomed })), plain(gameplay.PIERRE_DIALOGUE.hens[hensHomed]));
  }
  assert.deepEqual(plain(rules.pierreDialogue({ ...base, hensHomed: 3 })), plain(gameplay.PIERRE_DIALOGUE.eggsHandoff));
  for (let sugarCubes = 0; sugarCubes <= 3; sugarCubes++) {
    assert.deepEqual(plain(rules.pierreDialogue({ ...base, hensHomed: 3, hasEggs: true, sugarCubes })), plain(gameplay.PIERRE_DIALOGUE.sugar[sugarCubes]));
  }

  assert.match(
    rules.pierreDialogue({ ...base, hensHomed: 3, sugarCubes: 3, hasEggs: true, hasSugar: true })[0].text,
    /Michell/i,
  );
}

// Break caught: Pierre shipped facing west (an unused direction for talking to someone standing
// south of his stall). The south sheet already exists and is already registered -- this must be a
// pure data change, not a new asset.
{
  assert.equal(gameplay.PIERRE_ACTOR.facing, "south");
  assert.equal(gameplay.PIERRE_ACTOR.texture, "pierre-idle-south-sheet");
}

// Break caught: the three sign-panel objects came out of the generic PixelLab collider pipeline
// as solid (same bug class already fixed once for the arch and coop doorway) -- even though
// Frankie no longer interacts with them directly, a wall-mounted sign has no business physically
// blocking him. Each blocker must be the panel actually at that position, not an unrelated box.
{
  // Panels' own world placement, straight from Market.ts's editorCreate (mkt-c3e2b055/cfb0fa85/
  // 2ea31bc4, origin (0,0), 44x29 each) -- the ground truth for "is this blocker actually on its
  // panel", independent of MEMORY_PANEL_TEXTURES (which only maps symbol -> texture key).
  const panels = {
    feather: { x: 268, y: 372, width: 44, height: 29 },
    egg: { x: 341, y: 327, width: 44, height: 29 },
    apple: { x: 415, y: 370, width: 44, height: 29 },
  };
  assert.deepEqual(Object.keys(gameplay.MEMORY_MAT_BLOCKERS).sort(), [...gameplay.MARKET_SYMBOLS].sort());
  assert.deepEqual(Object.keys(gameplay.MEMORY_BASKETS).sort(), [...gameplay.MARKET_SYMBOLS].sort());
  for (const symbol of gameplay.MARKET_SYMBOLS) {
    const blocker = gameplay.MEMORY_MAT_BLOCKERS[symbol];
    const panel = panels[symbol];
    const blockerCenterX = blocker.x + blocker.width / 2;
    const blockerCenterY = blocker.y + blocker.height / 2;
    const panelCenterX = panel.x + panel.width / 2;
    const panelCenterY = panel.y + panel.height / 2;
    assert.ok(Math.hypot(blockerCenterX - panelCenterX, blockerCenterY - panelCenterY) < 20, `${symbol}'s sign-panel blocker must sit on its own sign panel`);
  }
}

// Break caught: Frankie's actual input is now the 3-basket stand (mkt-8afaf6af, world (148,264)
// 128x89), not the sign panels -- each basket position must actually fall within that stand's own
// footprint, or the interact zone floats over empty floor instead of the basket it's meant for.
{
  const stand = { x: 148, y: 264, width: 128, height: 89 };
  for (const symbol of gameplay.MARKET_SYMBOLS) {
    const basket = gameplay.MEMORY_BASKETS[symbol];
    assert.ok(
      basket.x >= stand.x && basket.x <= stand.x + stand.width && basket.y >= stand.y && basket.y <= stand.y + stand.height,
      `${symbol}'s basket must fall within the basket stand's own footprint`,
    );
  }
}

// Break caught: three baskets built into one 128px-wide stand sit close together by construction
// (~34px apart) -- unlike the old step-on-a-mat input, InteractionManager's nearestInRange picks
// the single closest zone by exact distance, so overlapping radii are harmless as long as no two
// baskets sit at the exact same point (which would make "nearest" ambiguous between them).
{
  for (const [a, b] of [["feather", "egg"], ["egg", "apple"], ["feather", "apple"]]) {
    const basketA = gameplay.MEMORY_BASKETS[a];
    const basketB = gameplay.MEMORY_BASKETS[b];
    assert.ok(basketA.x !== basketB.x || basketA.y !== basketB.y, `${a}/${b} baskets must not sit at the exact same point`);
  }
}

// Break caught: flooring lane-actor depth unconditionally across the whole lane draws a lane actor
// in front of Frankie everywhere, not just near the two side walls that motivated the floor in the
// first place -- his own depth is just his y, always less than the floor. laneActorDepth must only
// floor depth within the walls' own x-bands, and must return the actor's own y unfloored elsewhere.
{
  assert.equal(gameplay.laneActorDepth(100, 300), Math.max(300, 581), "point inside the left wall's band must be floored");
  assert.equal(gameplay.laneActorDepth(500, 300), Math.max(300, 581), "point inside the right wall's band must be floored");
  assert.equal(gameplay.laneActorDepth(300, 300), 300, "point in the open middle of the lane must NOT be floored");
  assert.equal(gameplay.laneActorDepth(300, 900), 900, "point south of both lanes, in neither band, must NOT be floored");
}

// Break caught: the arch door used to sit deep inside the passage near the pillars' own base,
// closer to one side than the other and far below the archway's own roofline -- it read as
// "off-center and at the bottom" instead of marking the arch itself. The door must be centered on
// the actual gap between the two pillars and sit at (not past) the new face blocker's own edge. The
// arch's own painted banner/pillars are already an obvious landmark, so its own bobbing arrow (a cue
// meant for doors with no visual landmark of their own) must be hidden rather than just repositioned.
{
  const pillarGapCenter = (164 + 454) / 2;
  assert.equal(gameplay.MARKET_EXIT_TO_STREET.x, pillarGapCenter, "door must be centered on the real gap between the two arch pillars");
  assert.equal(gameplay.MARKET_EXIT_TO_STREET.y, gameplay.MARKET_ARCH_FACE_BLOCKER.y - 4, "door must sit right at the face blocker's own edge");
  assert.equal(gameplay.MARKET_EXIT_TO_STREET.hideArrow, true, "the arch's own arrow must be hidden -- the arch itself is already an obvious landmark");
  assert.equal(gameplay.MARKET_ARCH_FACE_BLOCKER.x, 164, "face blocker must start at the pillar gap's own left edge");
  assert.equal(gameplay.MARKET_ARCH_FACE_BLOCKER.x + gameplay.MARKET_ARCH_FACE_BLOCKER.width, 454, "face blocker must end at the pillar gap's own right edge");
}

// Break caught: COOP_GOAL used to be a doorway rect a hen had to physically get inside. The coop's
// painted ramp is 20px wide and a hen's body is 22px, so that rect had to be widened past the art to
// 32px for her to fit -- which also let Frankie's own 28px body walk into a dead-end slot with 2px
// of clearance per side and jam there ("invisible barrier by the coop door"). It is a contact strip
// across the now-sealed front face instead: it must lie SOUTH of that face, must cover the band a
// hen's body actually occupies when the wall stops her, and must span the whole painted frontage.
{
  const face = gameplay.COOP_WALL_BLOCKERS[gameplay.COOP_WALL_BLOCKERS.length - 1];
  const faceBottom = face.y + face.height;
  const half = gameplay.HEN_TUNING.body.width / 2;
  assert.ok(gameplay.COOP_GOAL.y + gameplay.COOP_GOAL.height > faceBottom, "the contact strip must extend south of the coop's front face");
  // Where a hen physically stops: her body's south edge is her own y, its north edge y - body.height.
  const stoppedAt = faceBottom + gameplay.HEN_TUNING.body.height;
  for (const x of [face.x, 83, face.x + face.width]) {
    assert.equal(rules.pointInRect({ x, y: stoppedAt }, gameplay.COOP_GOAL), true, `a hen stopped against the coop's front at x${x} must count as contact`);
  }
  // The FRONT only. An earlier version inflated this to the whole building so a hen wedged against
  // a side face also homed, which made herding "a little too forgiving" -- you could nudge a hen
  // anywhere near the coop and it counted. Wedging is handled by escapeVelocity instead.
  assert.ok(gameplay.COOP_GOAL.y >= faceBottom, "the contact strip must start at the coop's front face, not wrap up its sides");
  for (const x of [face.x - half, face.x + face.width + half]) {
    assert.equal(rules.pointInRect({ x, y: gameplay.HEN_BOUNDS.y }, gameplay.COOP_GOAL), false, `a hen alongside the coop at x${x} must NOT count as reaching the front`);
  }
  // And the front face itself must be one unbroken band -- an opening is what created the trap.
  assert.ok(face.width >= 79 && face.y === 620, "the coop's front face must be sealed across its full width");
}

// Break caught: a fleeing hen steers straight away from Frankie, which pins her against a wall the
// moment that direction is one -- and because Frankie has to stand on the far side to push her at
// all, no approach angle frees her ("the hen gets stuck in the bottom left corner... it just
// continues trying to walk west"). escapeVelocity must turn her ALONG the obstacle, and must pick
// the tangent that heads back into open space rather than deeper into the corner.
{
  const bounds = gameplay.HEN_BOUNDS;
  const speed = gameplay.HEN_TUNING.fleeSpeed;
  const corner = { x: bounds.x, y: bounds.y + bounds.height };            // south-west corner
  const frankie = { x: corner.x + 30, y: corner.y - 30 };                 // pushing her into it
  const flee = rules.fleeVelocity(corner, frankie, speed);
  const escape = rules.escapeVelocity(corner, frankie, bounds, speed);
  assert.ok(flee.x < 0 && flee.y > 0, "the plain flee vector heads into the corner, which is the bug");
  // A quarter turn: same speed, perpendicular to the flee direction.
  assert.ok(Math.abs(Math.hypot(escape.x, escape.y) - speed) < 1e-6, "escaping must not change her speed");
  assert.ok(Math.abs(escape.x * flee.x + escape.y * flee.y) < 1e-6, "the escape must be perpendicular to the flee direction");
  // ...and the perpendicular that actually leads out of the corner, not along it into the next wall.
  const centre = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  assert.ok(escape.x * (centre.x - corner.x) + escape.y * (centre.y - corner.y) > 0, "the escape must head back into the open yard");
  assert.ok(gameplay.HEN_TUNING.stuckAfterMs > 0 && gameplay.HEN_TUNING.unstickMs > gameplay.HEN_TUNING.stuckAfterMs, "an unstick burst must outlast the detection window, or she re-pins immediately");
}

// Break caught: the coop image (mkt-50bba3ae, canvas 124x124 at (20,543)) is depth-sorted by
// Market.ts's depthSort() on its CANVAS bottom (667), but the building is only painted down to y662.
// COOP_DEPTH was written against the painted bottom, so henDepth's floor (COOP_DEPTH + 1 = 664) lost
// to the sprite's real 667 and hens still sorted behind the coop ("they still disappear under the
// coop"). MarketGameplay re-stamps the image with COOP_DEPTH; these two must therefore agree, and
// the floor must beat it.
{
  assert.equal(gameplay.COOP_DEPTH, 663, "COOP_DEPTH must be the coop's own painted bottom edge");
  assert.equal(gameplay.COOP_TEXTURE, "mkt-50bba3ae");
  const face = gameplay.COOP_WALL_BLOCKERS[gameplay.COOP_WALL_BLOCKERS.length - 1];
  for (const x of [50, 83, 118]) {
    assert.ok(gameplay.henDepth(x, face.y + face.height), "a hen at the coop's own front must sort in front of it");
    assert.ok(gameplay.henDepth(x, face.y + face.height) > gameplay.COOP_DEPTH, "a hen at the coop's own front must sort in front of it");
  }
}

// Break caught: mkt-gate's 128x128 frame is anchored (0.5, 1) at (169, 826) but the gate is only
// painted down to y787 -- sorting the sprite by its anchor drew it over Frankie while she stood
// south of it ("Frankie is still behind the coop gate"). Depth must be the painted bottom, and it
// must be less than the y the closed gate actually stops her at, or she sorts behind it again.
{
  assert.equal(gameplay.GATE.depth, 787, "the gate must sort by its painted bottom edge, not its sprite anchor");
  assert.ok(gameplay.GATE.depth < gameplay.GATE.y, "the gate's painted bottom sits above its own sprite anchor");
  const frankieBody = { width: 28, height: 14 };
  const blocked = gameplay.GATE.blocker.y + gameplay.GATE.blocker.height + frankieBody.height;
  assert.ok(blocked > gameplay.GATE.depth, "Frankie stopped by the closed gate must sort in front of it");
  // And the open doorway must be genuinely walkable: the gate leaf is removed outright, so the
  // fence's own colliders bound it. Anything narrower than the body plus real steering room is the
  // "invisible barrier" all over again.
  const fenceGap = { from: 137, to: 198 };
  assert.ok(fenceGap.to - fenceGap.from - frankieBody.width >= 24, "the open gate must leave real steering room, not a body-width slot");
  assert.ok(gameplay.GATE.blocker.x <= fenceGap.from + 8 && gameplay.GATE.blocker.x + gameplay.GATE.blocker.width >= fenceGap.to - 8, "the closed gate must seal the whole fence gap");
}

// Break caught: the basket stand (mkt-8afaf6af) came out of the generic collider pipeline as one
// solid block covering all three baskets. The removed blocker must be the stand's own box, not an
// unrelated one, and every basket must actually sit inside it (so removing it is what changes
// anything, not a coincidence).
{
  const b = gameplay.MEMORY_BASKET_STAND_BLOCKER;
  for (const symbol of gameplay.MARKET_SYMBOLS) {
    const basket = gameplay.MEMORY_BASKETS[symbol];
    assert.ok(
      basket.x >= b.x && basket.x <= b.x + b.width && basket.y >= b.y && basket.y <= b.y + b.height,
      `${symbol}'s basket must fall inside the basket-stand blocker being removed`,
    );
  }
}

// Break caught: removing that box left the counter with no collider at all, and its replacement was
// put at y264-314 -- entirely inside the canal band the tilemap already makes solid, so it changed
// nothing. Frankie walked into the stand and, sitting at a smaller y than the stand's own depth
// (353, its canvas bottom), vanished behind it ("still clip through the memory booth"). Meanwhile
// the 16px interact radius couldn't reach a basket from any legal standing spot ("no interaction
// with baskets") and the markers were drawn at the basket's own y, i.e. behind the stand ("the
// interaction and icons are still offset"). All three follow from one number: where the blocker
// stops her.
{
  const stand = { bottom: 353, depth: 353 };
  const frankieBody = { width: 28, height: 14 };
  const booth = gameplay.MEMORY_BOOTH_BLOCKER;
  const boothBottom = booth.y + booth.height;
  assert.ok(boothBottom >= stand.bottom, "the booth blocker must reach the stand's own painted bottom, or Frankie walks in behind it");
  assert.ok(booth.y < 320, "the booth blocker must start inside the canal band it butts against, leaving no seam to slip through");

  // The closest Frankie can legally stand: body's north edge against the blocker's south edge.
  const standingY = boothBottom + frankieBody.height;
  assert.ok(standingY > stand.depth, "Frankie at the counter must sort in front of the stand, not behind it");
  for (const symbol of gameplay.MARKET_SYMBOLS) {
    const basket = gameplay.MEMORY_BASKETS[symbol];
    const reach = Math.hypot(0, standingY - basket.y);
    assert.ok(
      reach <= gameplay.MEMORY_BASKET_TUNING.interactRadius,
      `${symbol}'s basket must be reachable (${reach.toFixed(1)}px) from the closest standable spot`,
    );
    // (interaction-nearest.test.mjs asserts that this radius still resolves to the basket Frankie is
    // actually standing in front of, rather than a neighbour.)
  }
  assert.ok(gameplay.MEMORY_BASKET_DEPTH > stand.depth, "basket markers must draw above the stand or they are simply invisible");
  // Above Frankie too -- she stands right in front of the counter and is 64px tall.
  assert.ok(gameplay.MEMORY_BASKET_DEPTH > standingY, "basket markers must draw above Frankie standing at the counter");
  // The badge must read as belonging to the basket it is over. indicatorOffset is measured from the
  // badge's own pointing tip (InteractionManager's BADGE_TIP), so it is literally how far above the
  // basket the tail floats: high enough to clear the basket marker, low enough not to detach from it
  // ("the indicators for the memory booth are really high up compared to the actual baskets" -- that
  // was an offset of 72, which parked it above the whole stall).
  const badgeTip = gameplay.MEMORY_BASKETS.egg.y - gameplay.MEMORY_BASKET_TUNING.indicatorOffset;
  assert.ok(gameplay.MEMORY_BASKET_TUNING.indicatorOffset > gameplay.MEMORY_BASKET_TUNING.radius, "the badge must clear the basket's own marker");
  assert.ok(badgeTip > 264, "the badge must stay on the stand, not float above the whole stall");
}

// Break caught: a pigeon sprite's painted body sits 34px above its own (0.5, 1) anchor, so rows
// picked as if the anchor were the bird put the whole bird over the canal ("there is still a pigeon
// walking on water"). Every route row and ambient perch must clear MARKET_WATER_BANDS outright.
{
  const art = gameplay.PIGEON_ART_BOUNDS;
  const points = [
    ...gameplay.PIGEON_ROUTES.flatMap((route) => [route.left, route.right]),
    ...gameplay.PIGEON_AMBIENT_PERCHES,
  ];
  for (const point of points) {
    const top = point.y + art.top;
    const bottom = point.y + art.bottom;
    for (const band of gameplay.MARKET_WATER_BANDS) {
      assert.ok(bottom < band.minY || top >= band.maxY, `a pigeon at y${point.y} paints its body (y${top}-${bottom}) over the canal at y${band.minY}-${band.maxY}`);
    }
  }
  // Routes must also stay out of the two side stalls, whose depth they lose to out in the open lane.
  for (const route of gameplay.PIGEON_ROUTES) {
    for (const point of [route.left, route.right]) {
      for (const band of gameplay.LANE_WALL_BANDS) {
        assert.ok(point.x + art.left > band.maxX || point.x + art.right < band.minX, `a pigeon at x${point.x} paints into the stall band x${band.minX}-${band.maxX}`);
      }
    }
  }
}

// Break caught: the cart is painted at local x1-61 of a 64px frame anchored (0.5, 1), so it covers
// x-31..x+29. fromX 180 put 26px of cart inside the west stall, which -- at the cart's own y-derived
// depth, far below the stall's -- drew as a hard vertical slice through it ("cart still clips west
// terrain on the left side"). Both endpoints must keep the painted cart out of both stall bands.
{
  const art = gameplay.CART_ART_BOUNDS;
  for (const x of [gameplay.LANE3.route.fromX, gameplay.LANE3.route.toX, gameplay.LANE3.parking.x]) {
    for (const band of gameplay.LANE_WALL_BANDS) {
      assert.ok(x + art.left > band.maxX || x + art.right < band.minX, `a cart at x${x} paints into the stall band x${band.minX}-${band.maxX}`);
    }
  }
  // The crossing itself must read as quick, not a trundle -- but the gap must still clear the
  // computed safe-crossing minimum (asserted separately above).
  const crossing = gameplay.CART_PHASES.find((phase) => phase.phase === "crossing");
  const span = gameplay.LANE3.route.toX - gameplay.LANE3.route.fromX;
  assert.ok(span / (crossing.durationMs / 1000) > gameplay.MARKET_PLAYER_SPEED * 1.5, "the cart must cross visibly faster than Frankie walks");
}

// Break caught: the three sign rugs were spread across 154px of wall, so from the one spot Frankie
// can stand to press the baskets, a phone viewport (390px at the market's 1.1 zoom = ~177px of
// world either side of him) cut off the right-hand apple rug entirely -- you were being asked to
// repeat a pattern you could not see all of.
{
  const standingX = gameplay.MEMORY_BASKETS.egg.x;
  const halfVisibleWidth = 390 / 2 / 1.1;
  for (const symbol of gameplay.MARKET_SYMBOLS) {
    const panel = gameplay.MEMORY_PANEL_POSITIONS[symbol];
    assert.ok(
      Math.abs(panel.x - standingX) < halfVisibleWidth,
      `${symbol}'s rug (x${panel.x}) must be on screen from the basket counter (x${standingX}) on a phone`,
    );
  }
  // And even so, the lit rug is echoed onto its own basket marker (see MemoryLane.setMatLit), so
  // the sequence is readable without looking away from the baskets at all.
  assert.match(
    readFileSync("src/systems/market/MemoryLane.ts", "utf8"),
    /private setMatLit\([\s\S]{0,600}?this\.baskets\.get\(symbol\)[\s\S]{0,300}?setFillStyle\(SYMBOL_COLORS\[symbol\]/,
    "setMatLit must echo the lit symbol onto its basket marker",
  );
}

// Break caught: at 700ms the next round's WATCH phase began almost on top of the last correct
// press, so there was no readable boundary between "you got that one" and "here is the next one".
assert.ok(
  gameplay.MEMORY_TIMING.roundCompleteMs >= gameplay.MEMORY_TIMING.litMs * 2,
  "a finished round must hold long enough to read as finished before the next pattern plays",
);

// Break caught: a correct press only brightened the marker's own white circle, which read as
// ambiguous next to the red wrong-answer flash ("make them green or something noticeably
// correct"). The correct colour must be unmistakably green, and distinct from the wrong flash.
{
  const correct = gameplay.MEMORY_BASKET_TUNING.correctColor;
  const [r, g, b] = [(correct >> 16) & 0xff, (correct >> 8) & 0xff, correct & 0xff];
  assert.ok(g > r + 40 && g > b + 40, `correctColor 0x${correct.toString(16)} must read as green`);
  assert.match(
    readFileSync("src/systems/market/MemoryLane.ts", "utf8"),
    /MEMORY_BASKET_TUNING\.correctColor/,
    "the correct-press flash must use correctColor rather than a hard-coded white",
  );
}

// Break caught (MAJOR): a checkpoint is where a failed crossing puts you back, so it has to be
// outside the hazard you just failed. Lane 1's sat 6px inside the southernmost pigeon row's own
// body: standing perfectly still on the respawn point got you run over about every 4 seconds --
// five times in 20 seconds, with no input at all.
{
  const frankieBody = { width: 28, height: 14 };
  const pigeonBody = gameplay.PIGEON_TUNING.body;
  const top = (y, h) => y - h;
  for (const route of gameplay.PIGEON_ROUTES) {
    const rowY = route.left.y;
    const overlaps = top(gameplay.LANE1.checkpoint.y, frankieBody.height) < rowY
      && gameplay.LANE1.checkpoint.y > top(rowY, pigeonBody.height);
    assert.ok(!overlaps, `lane 1's checkpoint (y${gameplay.LANE1.checkpoint.y}) must not sit in ${route.id}'s own body`);
  }
  // Lane 3's already had this clearance; keep them consistent so one respawn isn't lethal and the
  // other safe.
  const cartTop = gameplay.LANE3.route.y - gameplay.CART_TUNING.body.height;
  assert.ok(
    top(gameplay.LANE3.checkpoint.y, frankieBody.height) >= gameplay.LANE3.route.y || gameplay.LANE3.checkpoint.y <= cartTop,
    "lane 3's checkpoint must stay clear of the cart's own body",
  );
}

// Break caught (mobile): the memory booth's status line is world-space text, so on a 390px phone at
// zoom 1.1 only ~355px of world is visible, centred on Frankie. Anchored on the stand's own centre
// it ran off the left edge whenever he stood at the left-hand basket -- the one readout telling him
// whether to watch or to answer.
{
  const halfVisible = 390 / 2 / 1.1;
  for (const symbol of gameplay.MARKET_SYMBOLS) {
    const standingX = gameplay.MEMORY_BASKETS[symbol].x;
    const offset = Math.abs(gameplay.MEMORY_STATUS.x - standingX);
    assert.ok(
      offset + 60 < halfVisible,
      `the status line (x${gameplay.MEMORY_STATUS.x}) must stay on screen from the ${symbol} basket (x${standingX})`,
    );
  }
}

// Break caught (MAJOR): HEN_TUNING's unstick fields exist to free a hen pressed into something, but
// the "has she covered ground" test was distance-only. At a HEN_BOUNDS edge physics pushes the hen
// past the limit and the clamp snaps her back, so she alternates 1.1px and 0px frames -- and the
// moving frames refreshed the timer forever. A hen at the yard's boundary could not be pushed off
// it from any angle, indefinitely; one scripted herd trial never finished because of it.
assert.match(
  readFileSync("src/systems/market/Herding.ts", "utf8"),
  /const onEdge = [\s\S]{0,300}?HEN_BOUNDS[\s\S]{0,300}?&& !onEdge\)/,
  "the hen stuck test must treat sitting on a HEN_BOUNDS edge as not having moved",
);

console.log("market-rules.test.mjs: all assertions passed");
