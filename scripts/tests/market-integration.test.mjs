import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync("src/main.ts", "utf8");
const attach = readFileSync("src/systems/attachGameplay.ts", "utf8");
const market = readFileSync("src/systems/market/MarketGameplay.ts", "utf8");
const journal = readFileSync("src/systems/JournalUI.ts", "utf8");
const memoryLane = readFileSync("src/systems/market/MemoryLane.ts", "utf8");
const herding = readFileSync("src/systems/market/Herding.ts", "utf8");
const streetData = readFileSync("src/data/street.gameplay.ts", "utf8");
const pigeonLane = readFileSync("src/systems/market/PigeonLane.ts", "utf8");
const cartLane = readFileSync("src/systems/market/CartLane.ts", "utf8");

assert.match(main, /import Market from "\.\/scenes\/Market"/);
assert.match(main, /scene: \[[^\]]*Street, Market(?:, PaninisFlat)?\]/s);
assert.match(attach, /"Apartment" \| "Bakery" \| "Street" \| "Market"/);
assert.match(attach, /new MarketGameplay\(/);
assert.match(attach, /transition\.addDoor\(STREET_DOOR_TO_MARKET,/);
assert.doesNotMatch(attach, /MARKET_LOCKED_LINES/);
assert.match(attach, /spawnId === "fromMarket"/);
assert.match(market, /removeGeneratedBlocker\(MARKET_ARCH_PASSAGE_BLOCKER\)/);
assert.match(market, /removeGeneratedBlocker\(COOP_PASSAGE_BLOCKER\)/);
assert.match(market, /for \(const bounds of COOP_WALL_BLOCKERS\)/);
assert.match(market, /frame\.textureFrame[^\n]*GATE_ANIMATION\.usableFrame/);
assert.match(market, /state\.markPierreMet\(\)/);
assert.match(market, /new Herding\(/);
assert.match(journal, /id: "eggs", label: "Eggs", locked: false/);
assert.match(journal, /id: "sugar", label: "Sugar", locked: false/);

// Break caught: a radius-60 trigger (this door's own prior fix) let Frankie fire the Market arch
// from well short of actually reaching it, unlike every other door in the game (6-10px) -- "the
// hitbox to enter the Market through the arch is too large." The generated collider spanning the
// whole opening had also been removed with nothing put back, so the two real pillars had no
// collision at all ("it places me in a spot where I can phase through the market wall"). Both are
// fixed together: a small radius centered on the real gap, plus two blockers matching just the
// pillars.
assert.match(streetData, /STREET_MARKET_PILLAR_BLOCKERS = \[/, "the street-side arch's two pillars must have their own solid colliders");
assert.match(attach, /addStaticBlocker\(scene, streetColliders, bounds\)/, "the pillar blockers must actually be registered on the street scene's world colliders");
assert.match(readFileSync("src/systems/SceneTransition.ts", "utf8"), /if \(!this\.armed\)/, "the re-arm gate must still exist as a general safety net for doors whose spawn can land near their own trigger");

// Break caught: a homed hen that just sits at its settle point forever reads as "stopped in the
// yard," not "went inside the coop." It must fade out and hide once it arrives.
assert.match(herding, /alpha: 0,[\s\S]{0,120}?setVisible\(false\)/, "homed hens must fade out and hide, not stay visible");

// Break caught: when a hen is already homed (persisted via GameState), the constructor must also
// hide it (alpha: 0, setVisible), not just disable its physics body. Otherwise it reappears on
// Market scene re-entry. The constructor's "if (homed)" branch must match the end-state of home()'s
// fade-out tween: alpha set to 0 and setVisible(false).
assert.match(herding, /if\s*\(\s*homed\s*\)\s*{[\s\S]{0,200}?sprite\.alpha\s*=\s*0[\s\S]{0,80}?setVisible\(false\)/, "already-homed branch of constructor must hide sprite (alpha: 0, setVisible)");

// Break caught: the wander branch used to set a random-angle velocity but play the (walk-less)
// idle animation, so a wandering hen visibly slid instead of walking. Any nonzero-velocity branch
// must play "run"; "idle" must never be paired with the branch that sets a wander velocity.
assert.match(herding, /this\.playDirectional\(hen\.sprite, "run", body\.velocity\.x\)/, "wandering (nonzero-velocity) hens must play their run animation");
assert.doesNotMatch(herding, /this\.playDirectional\(hen\.sprite, "idle", body\.velocity\.x\)/, "idle animation must never be paired with a nonzero wander velocity");

// Break caught: without an unconditional badge, a first-time visitor standing across the square
// has no cue that Pierre is there to talk to at all -- InteractionManager's own "!" badge only
// shows once Frankie is already within interact range.
assert.match(market, /createPierreOnboardBadge/, "Market must show an onboarding badge above Pierre before he's been met");
assert.match(market, /pierreOnboardBadge\?\.destroy\(\)/, "the onboarding badge must be torn down once Pierre is actually met");

// Break caught: the two side-wall backdrop images span the full height of both lanes and get a
// single fixed depth from the scene's one-time static sort -- pigeons/cart previously got their
// depth from their own (much smaller) y every frame, so they always drew behind these walls
// while crossing. Every place either lane sets its actor's depth must run it through laneActorDepth,
// which only floors depth within the walls' own x-bands (see market-rules.test.mjs for the case
// this guards against: flooring unconditionally would draw a lane actor in front of Frankie too).
assert.match(pigeonLane, /laneActorDepth\(point\.x, point\.y\)/, "pigeon spawn depth must use laneActorDepth");
assert.match(pigeonLane, /laneActorDepth\(sprite\.x, sprite\.y\)/, "pigeon walk-phase depth update must use laneActorDepth");
assert.match(pigeonLane, /laneActorDepth\(perch\.x, perch\.y\)/, "pigeon ambient-perch depth must use laneActorDepth");
assert.match(cartLane, /laneActorDepth\(LANE3\.parking\.x, LANE3\.route\.y\)/, "cart depth must use laneActorDepth");

// Break caught: the three sign-panel colliders have no reason to physically block Frankie -- he
// never touches them at all in the current design -- so they must be removed the same way the
// arch/coop generated blockers already are.
assert.match(market, /for \(const bounds of Object\.values\(MEMORY_MAT_BLOCKERS\)\) this\.removeGeneratedBlocker\(bounds\)/, "the three sign-panel colliders must be removed at startup");

// Break caught: the presentation sequence must light the sign panel's own halo, not a separate
// basket marker -- input moved to the basket stand's interact zones, so the sign is purely visual.
assert.match(memoryLane, /this\.setMatLit\(symbol, true\)/, "round presentation must light the sign panel's halo");
assert.match(market, /new MemoryLane\(/, "MemoryLane must still be wired into MarketGameplay");

// Break caught: input must go through InteractionManager (E-press at a basket), not a per-frame
// position check against the player's own coordinates -- that position-based path is exactly what
// made the mats double as physical stepping targets in the first place.
assert.match(memoryLane, /this\.interactions\.addZone\(\{/, "basket input must be registered as InteractionManager zones");
assert.doesNotMatch(memoryLane, /symbolAtPlayer/, "position-based mat detection must be fully removed, not left as dead code");

// Break caught: the dart/crossing tweens are the ONLY movement that crosses the whole lane
// (idle/walk/flap/gap either don't move or barely do) -- without a per-frame depth update here,
// depth freezes at whatever it was before the tween started (always inside a wall band) for the
// entire flight, including the open middle where it must NOT stay floored.
assert.match(pigeonLane, /onUpdate: \(\) => sprite\.setDepth\(laneActorDepth\(sprite\.x, sprite\.y\)\)/, "the pigeon dart tween must recompute depth every frame, not just at spawn");
assert.match(cartLane, /onUpdate: \(\) => this\.cart\.setDepth\(laneActorDepth\(this\.cart\.x, this\.cart\.y\)\)/, "the cart crossing tween must recompute depth every frame, not just at spawn");

// Break caught: the two side-wall stalls were flat images with no collider at all -- Frankie could
// walk straight through/behind them despite reading as solid market furniture.
assert.match(market, /for \(const bounds of MARKET_SIDE_WALL_BLOCKERS\) this\.addStaticBlocker\(bounds\)/, "the two side-wall stalls must get a real solid collider");

// Break caught: the Street scene's own market archway had the exact same "generated fallback
// collider spans the whole opening" bug the Market scene's own arch already had fixed once -- it
// must be removed the same way, and the trigger it uncovers must be wide enough to actually be
// found (see STREET_DOOR_TO_MARKET's own comment for the measured old-vs-new numbers).
assert.match(attach, /removeGeneratedBlocker\(streetColliders, STREET_MARKET_ARCH_PASSAGE_BLOCKER\)/, "the street-side market arch's generated blocker must be removed");
// This used to assert radius 14 -- "tight, matching every other door in the game" -- which was the
// right instinct for a doorway and the wrong one for a 75px archway: only ~27px of the opening
// actually led to the Market, and walking north anywhere else put Frankie in a dead pocket behind
// the arch art. The invariant that actually matters is the relationship between the trigger, the
// gap it sits in, and the spawn that sits below it.
{
  const num = (source, re) => Number(source.match(re)[1]);
  const doorX = num(streetData, /STREET_DOOR_TO_MARKET: Door = \{ x: (\d+),/);
  const radius = num(streetData, /STREET_DOOR_TO_MARKET: Door = \{ x: \d+, y: \d+, radius: (\d+),/);
  const pillars = [...streetData.match(/STREET_MARKET_PILLAR_BLOCKERS = \[([\s\S]*?)\] as const;/)[1]
    .matchAll(/x: (\d+), y: \d+, width: (\d+)/g)].map((m) => [Number(m[1]), Number(m[1]) + Number(m[2])]);
  const gap = [Math.max(...pillars.map(([, right]) => right).filter((right) => right < doorX)),
               Math.min(...pillars.map(([left]) => left).filter((left) => left > doorX))];
  assert.ok(doorX - radius <= gap[0] && doorX + radius >= gap[1],
    `the arch trigger (${doorX}+-${radius}) must span the whole walkable gap (${gap[0]}-${gap[1]}), or part of the opening leads nowhere`);
  const spawnY = num(streetData, /STREET_SPAWN_FROM_MARKET = \{ x: \d+, y: (\d+) \}/);
  const doorY = num(streetData, /STREET_DOOR_TO_MARKET: Door = \{ x: \d+, y: (\d+),/);
  assert.ok(spawnY - doorY > radius, "the arrival spawn must still sit outside the widened trigger");
}
assert.match(streetData, /arrowOffsetY: -140/, "the arch's arrow must be repositioned near its visual top, not left at ground level");

// Break caught: pigeons/cart used to fade to invisible and teleport off past the lane's own edge
// between crossings, reading as "flies and disappears and reappears" / "disappears upon reaching
// one end" rather than a flock or cart that's simply resting before heading back. Both must now stay
// visible, parked exactly where they arrived, through their own non-hazardous "idle"/"gap" phases.
assert.doesNotMatch(pigeonLane, /setVisible\(false\)/, "pigeons must never be hidden -- they stay visible and park in place instead of disappearing");
assert.doesNotMatch(cartLane, /setVisible\(false\)/, "the cart must never be hidden -- it stays visible and parks in place instead of disappearing");
assert.match(pigeonLane, /sprite\.setPosition\(to\.x, to\.y\)\.setAlpha\(1\)\.setVisible\(true\)/, "pigeons must park visibly at their arrival point during \"gap\", not fade out");
// `from`, not `to`, since the cart gained a return pass: direction now flips at the end of each
// crossing, so by the time a waiting phase renders, the spot it just arrived at IS the next
// crossing's `from`. Same requirement as before -- park visibly where you stopped -- expressed
// against the endpoint that still names it.
assert.match(cartLane, /this\.cart\.setVisible\(true\)\.stop\(\)\.setFrame\(CART_ANIMATION\.parkedFrame\)\.setPosition\(from, LANE3\.route\.y\)/, "the cart must park visibly at its arrival point while waiting, not fade out");
assert.match(cartLane, /if \(CART_PHASES\[this\.phaseIndex\]\.phase === "crossing"\) this\.direction =/, "direction must flip at the end of each crossing, so the cart returns within a cycle");
assert.doesNotMatch(cartLane, /CART_PHASES\[[01]\]\.durationMs/, "renderPhase must use the running phase's own duration -- there is more than one crossing per cycle now");

// Break caught: a hen approaching the coop's own front rendered behind the building well before
// homing, reading as "goes under the coop, then disappears" instead of the deliberate fade-out on
// entry. Two halves, both required: hens must run their depth through henDepth every frame, AND the
// coop image itself must be re-stamped with COOP_DEPTH -- Market.ts's depthSort() otherwise gives it
// its canvas bottom (667), which silently beats henDepth's own floor (664) and the bug persists.
assert.match(herding, /henDepth\(clamped\.x, clamped\.y\)/, "hens must use henDepth so they don't render behind the coop before actually homing");
assert.match(market, /getAuthoredImage\(COOP_TEXTURE\)\?\.setDepth\(COOP_DEPTH\)/, "the coop image must be re-stamped with COOP_DEPTH, or henDepth's floor loses to its canvas bottom");

// Break caught: homing used to require a hen to cross a doorway rect's south edge on one exact
// frame, heading the right way. A fleeing hen's path is erratic, so she ran along the coop's front
// without ever triggering. Simple containment is the rule now ("as long as they are in contact with
// the front of the coop").
assert.match(herding, /pointInRect\(current, COOP_GOAL\)/, "a hen must home on contact with the coop's front, not on an exact directional crossing");

// Break caught: the whole wander/flee block used to be gated on `enabled()` (met Pierre AND gate
// open) -- hens stood frozen in the idle pose the entire time before the gate opened, then sprang
// to life the instant Frankie walked in ("hens should be moving already before Frankie enters the
// coop"). Only fleeing from Frankie's distance and actually homing may still depend on it.
assert.doesNotMatch(herding, /if \(!this\.enabled\(\) \|\| this\.scene\.physics\.world\.isPaused\)/, "ambient wander must not be gated on enabled() -- only the world-pause check may short-circuit it");
assert.match(herding, /this\.enabled\(\)\s*\n\s*\?\s*Phaser\.Math\.Distance\.Between/, "flee distance must still depend on enabled(), just not gate the wander branch itself");

// Break caught: the gate sprite was depth-sorted on its own (0.5, 1) anchor at y826, 39px below
// where the gate is actually painted, so Frankie -- stopped by the closed gate at y798 -- drew
// behind it ("Frankie is still behind the coop gate before opening and entering").
assert.match(market, /\.setDepth\(GATE\.depth\)/, "the gate must sort on its painted bottom edge, not its sprite anchor");
assert.doesNotMatch(market, /setDepth\(GATE\.y\)/, "GATE.y is the sprite anchor, not the gate's own ground line");

// Break caught: the opposite over-correction. Two rounds of always-solid post blockers flanking the
// gate leaf narrowed a doorway that is only 26px of visible gap to begin with down to a 15px slot
// for Frankie's 28px body -- the "invisible barrier by the coop door". The gate is one blocker that
// is removed outright on opening; the fence's own colliders bound the opening after that.
assert.doesNotMatch(market, /GATE_POST_BLOCKERS/, "the gate must not re-introduce always-solid posts inside its own doorway");
assert.match(market, /this\.gateBlocker = this\.addStaticBlocker\(GATE\.blocker\)/, "the closed gate must still be solid");

// Break caught: removing the basket stand's whole-footprint generated collider left the stand with
// no collider at all -- Frankie could walk through the counter itself ("still clip through the
// memory booth"). Its replacement must cover the counter's own measured solid mass (market-rules
// asserts the geometry); this is the wiring half.
assert.match(market, /this\.addStaticBlocker\(MEMORY_BOOTH_BLOCKER\)/, "the memory booth's solid mass must get its own collider");

// Break caught: the basket markers were drawn at the basket's own y, i.e. behind the very stand
// they sit on, so nothing at all marked which basket the interact badge belonged to ("no
// interaction with baskets and the interaction and icons are still offset").
assert.match(memoryLane, /\.setDepth\(MEMORY_BASKET_DEPTH\)/, "basket markers must draw above the stand, not at their own y");

// Break caught: the three memory-lane sign panels were each placed independently by Market.ts's own
// generated editorCreate, landing in two different lanes and one right at a water edge ("align the
// rugs, the feather is falling off the sidewalk"). Runtime must re-position all three into one row.
assert.match(market, /panel\.setPosition\(position\.x, position\.y\)/, "the three memory-lane panels must be re-positioned into a single aligned row");

// Break caught: the cart's physics body was only enabled during its "crossing" phase, so the cart
// parked at either end of the lane had no collision at all -- Frankie walked straight through it
// ("in the third lane, Frankie can actually walk through the cart at the very end"). It is solid
// for its whole life now; the crossing phase is the one time it must NOT push her, because being
// run over is the lane's own hazard.
assert.match(cartLane, /body\.enable = true;\s*\n\s*body\.immovable = true;/, "the cart must be solid for its whole life, not only while crossing");
assert.match(cartLane, /if \(!this\.isCrossing\(\)\) return true;/, "the cart must stop Frankie while it is parked");
// ...and while it IS crossing, the contact must decide the hit right there and refuse to separate.
// Deciding it in the overlap callback instead only fires on real interpenetration, which walking
// into the cart's side never reaches: Frankie gets pinned at exactly touching (zero penetration)
// and the cart rolls through him unharmed.
assert.match(cartLane, /this\.onHit\(\);\s*\n(\s*\/\/[^\n]*\n)*\s*return false;/, "a contact with a crossing cart must hit Frankie and must not push him out of the way");
assert.doesNotMatch(cartLane, /body\.enable = false;\s*\n\s*this\.dustTimer/, "renderPhase must not switch the body back off each phase");

// Break caught: an early press during the pattern was dropped outright, so a round of five symbols
// locked the baskets for ~3.4s and they read as broken ("I can't even really interact with the
// baskets at all while that is happening"). A press must cut the presentation short and count.
assert.match(memoryLane, /if \(!this\.accepting\) \{[\s\S]{0,900}?this\.accepting = true;/, "pressing a basket mid-presentation must take over rather than be ignored");
// Break caught (2026-09-14): the take-over press stopped the presentation but was not itself
// entered, so the first basket always had to be pressed twice. The interrupting press must fall
// through to enter() rather than return.
assert.match(memoryLane, /this\.accepting = true;[\s\S]{0,200}?\}\s*this\.scheduleIdleReplay\(\);\s*this\.enter\(symbol\);/, "the press that cuts the presentation short must count as the first entry");

// Break caught: the minigame never said what phase it was in or how far through the sequence the
// player was ("it's kind of hard to know when to actually start or what's the starting point").
assert.match(memoryLane, /private refreshStatus\(\)/, "the memory lane must surface its own phase and progress");
assert.match(memoryLane, /MEMORY_STATUS\.yourTurn/, "the status line must name the player's turn explicitly");

// Break caught: the "glow" marking the lit rug was a Phaser.Filters.Glow that was alive and
// reporting its own outerStrength every frame while rendering nothing visible at this sprite size,
// so the only cue was the scale pop ("it'd be nice if they had a corresponding glow").
assert.doesNotMatch(memoryLane, /addGlow\(/, "the sign-panel glow must not go back to the filter that rendered nothing");
assert.match(memoryLane, /setBlendMode\(Phaser\.BlendModes\.ADD\)/, "the lit halo must be additively blended so it reads as light on the brick");

console.log("market-integration.test.mjs: all assertions passed");

// Break caught: the memory booth armed as soon as Pierre had been spoken to, which happens at the
// far south end of the market. By the time you had herded the hens and crossed the pigeon lane it
// had been cycling rounds to an empty room, and you walked in partway through a sequence you had no
// way to have watched -- with "WATCH" on screen telling you the truth about a round you had already
// missed. It waits for Frankie to be standing in the lane now, and going back out replays the round
// from its first symbol rather than resuming mid-sequence.
assert.match(memoryLane, /private playerInLane: \(\) => boolean/, "the memory lane must be told whether Frankie is standing in it");
assert.match(memoryLane, /if \(!inLane\) return;\s*\n\s*this\.started = true;/, "the first round must wait for Frankie to enter the lane");
assert.match(memoryLane, /if \(!inLane\) this\.suspend\(\);/, "walking out of the lane must stop the booth presenting to nobody");
assert.match(memoryLane, /private suspend\(\)[\s\S]{0,400}?cursor: 0/, "suspending must put the round back to its first symbol");
assert.match(
	readFileSync("src/data/market.gameplay.ts", "utf8"),
	/export const MEMORY_LANE_TRIGGER = \{ x: \d+, y: \d+, width: \d+, height: \d+ \}/,
	"the lane Frankie has to be standing in must be an authored box, not a magic number in the lane class",
);

console.log("market-integration.test.mjs: memory-lane presence assertions passed");
