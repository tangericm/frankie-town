import type { DialogueLine } from "../systems/DialogueSequencer";

export type MarketSymbol = "feather" | "egg" | "apple";
export type MarketLaneId = "lane1" | "lane2" | "lane3";

export const MARKET_WORLD = { width: 640, height: 1232 } as const;
export const MARKET_PLAYER_SPEED = 110;
export const TOUCH_CROSSING_MARGIN_MS = 900;

// The authored dog stand-in's 64px export box ends at (365,854); normal Street arrivals replace
// that stand-in with Frankie while preserving this reviewed foot anchor.
export const MARKET_SPAWN_FROM_STREET = { x: 365, y: 854, facing: "north" } as const;

// The visible arch passage is centered here in map-composite.png. The generated building fallback
// collider spans the opening because the export's sourceJson contains no foot shape; traversal
// setup must suppress this one named blocker before registering the return door.
//
// The arch's own art (mkt-5fe27a60, a flat painted backdrop spanning x196-416/y853-1061 with the
// "MARKET" banner, roof, and two flanking stalls all baked into one fully-opaque image -- there is
// no real transparent tunnel cutout to sample) has zero collider of its own above the two stone
// pillars (which start at y966, see MARKET_ARCH_FACE_BLOCKER below): Frankie could walk clean
// through the archway's painted upper half and out the far side, rendering behind the backdrop's
// depth-sorted bottom edge the whole way ("go behind/beneath the arch"). The door used to sit deep
// inside that open passage near the pillars' own base (y1044) -- centered but visually low, at the
// bottom of the archway rather than where a person actually meets the arch. It now sits right at
// the new face wall below, at the point Frankie's own approach is stopped. The arch itself (banner,
// pillars, the word "MARKET") is already an obvious landmark, so the bobbing arrow above it read as
// clutter rather than a hint -- hidden here the same way a doorway with visible art of its own
// wouldn't get one either.
export const MARKET_EXIT_TO_STREET = {
	x: 309,
	y: 858,
	radius: 22,
	target: "Street",
	spawnId: "fromMarket",
	hideArrow: true,
	// Entered by walking south into the arch's face wall. Without this, walking east or west along
	// that wall past the door's own radius teleported Frankie out of the market sideways.
	enterFacing: "south",
} as const;
export const MARKET_ARCH_PASSAGE_BLOCKER = { x: 236, y: 969, width: 141, height: 92 } as const;
// Seals the archway's painted upper half (x164-454, the same gap between the two pillars below)
// from y862 -- MARKET_SPAWN_FROM_STREET's own y854 landing spot, the reviewed foot anchor for
// stepping in from Street -- down to y966, the pillars' own top edge. Frankie now physically meets
// this wall on approach instead of wandering into the backdrop's painted alcove.
export const MARKET_ARCH_FACE_BLOCKER = { x: 164, y: 862, width: 290, height: 104 } as const;

// radius 68, not a smaller "just cover the counter" number -- Pierre's own stall counter
// (Market.COLLIDERS' [430,722,88,61] box) physically keeps Frankie's body center 57-62px away
// from this point from every direction (measured empirically: south 62px, east 59px, west 57px),
// so anything below ~63 makes him unreachable by walking no matter which side you approach from.
// y735 put him up among the goods laid out ON the counter (mkt-de3248d3's own surface runs y745-755),
// so he read as standing on/in front of the stall rather than working behind it -- his whole body,
// feet included, sat in front of the produce. y746 drops him just far enough for the counter's own
// goods to cover his feet while his head and shoulders still clear them: a shopkeeper behind a
// counter. (y756, tried first, buried all but the tip of his hat; y746 was still a little deep.) He stays inside the stall's own
// footprint either way -- Market.COLLIDERS' [430,722,88,61] means Frankie can never reach that side
// -- and his depth stays below the stall art's own 783, so the art draws over him.
export const PIERRE = { x: 473, y: 741, radius: 84 } as const;
export const PIERRE_ACTOR = {
	facing: "south",
	texture: "pierre-idle-south-sheet",
	frameRate: 9,
	collider: { width: 20, height: 14 },
} as const;

export const GATE = {
	x: 169,
	y: 826,
	radius: 58,
	// mkt-gate is a 128x128 spritesheet frame anchored (0.5, 1) at (169, 826), but the painted gate
	// only occupies wx143-194 / wy745-787 inside that frame -- the bottom 39px of the frame is empty
	// canvas. Depth-sorting the sprite by its anchor (826) therefore claimed 39px of ground the gate
	// does not actually cover, so Frankie -- whom the closed gate stops at y798 -- sorted BEHIND the
	// gate art while standing well south of it ("Frankie is still behind the coop gate before opening
	// and entering"). Sort by the painted bottom instead. Measured off the open frame's own alpha
	// channel (frame 17 reaches wy787; the closed frame stops at wy784).
	depth: 787,
	// The whole painted span, solid while closed and removed entirely once the gate swings open.
	// Measured off frame 0's alpha channel: wx143-194, wy745-784.
	//
	// There are deliberately NO separate always-solid post colliders any more. Rounds of shaving
	// those posts (9px, then 4px) never fixed "there is an invisible barrier by the coop door"
	// because the geometry cannot be won: the open frame's own art leaves a visible gap of just 26px
	// (opaque runs wx143-158 and wx184-194) and Frankie's collision body is 28px wide, so ANY post
	// collider leaves her threading a 15px-or-less window through a doorway that already looks too
	// small for her. With the leaf gone the fence's own colliders (wx106-137 and wx198-229) bound the
	// opening instead, giving a 61px doorway -- 33px of steering room. The cost is that she may brush
	// the outermost few px of a post's art on the way through, which is far cheaper than a soft-lock,
	// and she now draws in front of it rather than behind (see `depth`). The closed gate is still
	// fully solid, so nothing "phases through the coop gate".
	blocker: { x: 143, y: 745, width: 51, height: 39 },
} as const;
export const GATE_ANIMATION = {
	key: "mkt-gate-open",
	texture: "mkt-gate",
	closedFrame: 0,
	startFrame: 9,
	usableFrame: 14,
	openFrame: 17,
	frameRate: 9,
} as const;

// mkt-50bba3ae is placed at (20,543) on a 124x124 canvas, so Market.ts's depthSort() -- which sorts
// every authored image by its canvas bottom -- stamped it with depth 667. The painted coop only
// reaches wy662 (measured off its own alpha channel); the 5px of empty canvas below that claimed
// ground the building does not cover. henDepth's floor below was written against the painted bottom
// and so lost to the real 667 every single time: a hen (and Frankie) standing at the coop's own
// front still sorted behind the building ("they still disappear 'under' the coop when they go
// home"). MarketGameplay re-stamps the image with COOP_DEPTH so the sprite and this constant agree,
// which is what actually makes the floor work.
export const COOP_TEXTURE = "mkt-50bba3ae";
export const COOP_DEPTH = 663;
export const COOP_FOOTPRINT_X = { minX: 20, maxX: 144 } as const;
export function henDepth(x: number, y: number): number {
	return x >= COOP_FOOTPRINT_X.minX && x <= COOP_FOOTPRINT_X.maxX ? Math.max(y, COOP_DEPTH + 1) : y;
}

// Measured directly off mkt-50bba3ae's own alpha channel (the coop's real opaque pixels), not
// guessed from its bounding box. The roof/body is one solid block down to y620. Below that the art
// splits into a center entry ramp (opaque x72-92, y620-662) flanked by two short support legs
// (opaque x52-60 and x105-113, y643-651).
//
// COOP_GOAL is not a doorway a hen walks *into*. Making it one was the original problem: the
// painted ramp is 20px wide and a hen's own body is 22px, so any "get inside this rect" goal was
// either narrower than the hen or -- once widened past the art so she'd fit -- a slot Frankie's own
// 28px body could walk into and jam in. The coop's front is sealed (see COOP_WALL_BLOCKERS) and
// this is a contact strip laid across that sealed front instead.
//
// It covers the FRONT face only: x42-121 (the wall's own span) by y663-687, the band a hen occupies
// when the front stops her (her body's south edge lands at y678). An earlier version inflated this
// to the whole building so a hen wedged against a side face would also home, which made herding
// "a little too forgiving" -- you could bump a hen anywhere near the coop and she'd count. Wedging
// is fixed where it belongs instead, in how a fleeing hen steers along a wall (see HEN_TUNING's
// unstick fields and Herding.ts), not by widening the goal until nothing can miss it.
export const COOP_GOAL = { x: 42, y: 663, width: 79, height: 24 } as const;
// The PixelLab fallback collider covers the whole henhouse. Runtime gameplay removes this one box
// and replaces it with the measured COOP_WALL_BLOCKERS below.
export const COOP_PASSAGE_BLOCKER = { x: 42, y: 608, width: 79, height: 55 } as const;
export const COOP_WALL_BLOCKERS = [
	// Top wall's height covers the coop sprite's full roof silhouette, not just the short band above
	// the doorway -- that roof band had no collider before, so Frankie and hens could walk straight
	// onto it. Its y (543) is mkt-50bba3ae's placement/canvas top edge, not a measured opaque-pixel
	// boundary -- the art's actual opaque bounds start lower, around y551, so this extends a few px
	// into transparent canvas space above the roof. Harmless overcoverage, not a precise measurement.
	{ x: 42, y: 543, width: 79, height: 77 },
	// The front face, doorway included: one solid band across x42-121, y620-663. Previously this was
	// split into two posts with the ramp left open between them, which is what let Frankie walk into
	// a 32px-wide dead-end alcove she could then only leave by moving exactly due south. Hens don't
	// need the opening either -- they home on contact with this face (see COOP_GOAL above) and the
	// settle tween carries them the rest of the way in with physics already disabled.
	{ x: 42, y: 620, width: 79, height: 43 },
] as const;
export const HEN_IDS = ["hen-a", "hen-b", "hen-c"] as const;
export const HEN_STARTS = [
	{ id: "hen-a", x: 198, y: 698 },
	{ id: "hen-b", x: 164, y: 676 },
	{ id: "hen-c", x: 215, y: 648 },
] as const;
// North (y620) is the coop's own roof/front wall boundary -- never letting the clamp put a hen
// north of it keeps hens out of that dead-end band entirely (see COOP_WALL_BLOCKERS' comment).
// COOP_GOAL's contact strip (y655-687) sits well south of it and is unaffected. The other three edges used
// to sit exactly flush with the yard's own boundary fence (west column at x13-44, east column at
// x292-323, south row at y763-784) -- a hen clamped to that exact edge still has half its own body
// overlapping the fence with nothing to push it back out, which read as getting stuck at the wall.
// Inset each edge by half the hen's own body dimension (HEN_TUNING.body) so the clamp never
// permits a position that overlaps the fence at all.
export const HEN_BOUNDS = { x: 55, y: 620, width: 226, height: 135 } as const;
// Where a homed hen's sprite visually settles: on the coop's own painted entry ramp (x72-92), north
// of COOP_GOAL's contact strip and behind the now-sealed front face. Purely visual -- home() has
// already disabled her body before tweening her here, so the sealed wall doesn't block it, and
// henDepth keeps her drawn in front of the coop for the whole short walk-in before she fades out.
export const HEN_SETTLE_POINTS = [
	{ x: 76, y: 652 },
	{ x: 83, y: 646 },
	{ x: 90, y: 652 },
] as const;
export const HEN_TUNING = {
	panicRadius: 58,
	releaseRadius: 76,
	fleeSpeed: 68,
	idleWanderSpeed: 14,
	lateralJitterRatio: 0.15,
	body: { width: 22, height: 15 },
	idleDecisionMinMs: 900,
	idleDecisionMaxMs: 1800,
	settleDurationMs: 360,
	homedBouncePx: 4,
	homedFadeMs: 220,
	// A fleeing hen steers straight away from Frankie, which is useless the moment that direction is
	// a wall: she presses into it and stays there, and because Frankie has to stand on the far side
	// to push her at all, he can never steer her off it ("the hen gets stuck in the bottom left
	// corner... it just continues trying to walk west"). If she has been in flee mode this long
	// without actually covering ground, she commits to the tangential direction instead -- sliding
	// along the wall she is pinned against rather than into it.
	stuckAfterMs: 260,
	stuckSpeedPx: 6,
	unstickMs: 620,
} as const;
export const HEN_ANIMATIONS = {
	idleEast: { key: "mkt-hen-idle-east", texture: "mkt-hen-idle", startFrame: 9, endFrame: 17, frameRate: 9 },
	idleWest: { key: "mkt-hen-idle-west", texture: "mkt-hen-idle", startFrame: 18, endFrame: 26, frameRate: 9 },
	peckEast: { key: "mkt-hen-peck-east", texture: "mkt-hen-pecking", startFrame: 9, endFrame: 17, frameRate: 9 },
	peckWest: { key: "mkt-hen-peck-west", texture: "mkt-hen-pecking", startFrame: 18, endFrame: 26, frameRate: 9 },
	runEast: { key: "mkt-hen-run-east", texture: "mkt-hen-running", startFrame: 9, endFrame: 17, frameRate: 12 },
	runWest: { key: "mkt-hen-run-west", texture: "mkt-hen-running", startFrame: 18, endFrame: 26, frameRate: 12 },
} as const;

export const SUGAR_CUBES = [
	{ id: "lane1", x: 361, y: 441, texture: "mkt-ceed94f9" },
	{ id: "lane2", x: 361, y: 280, texture: "mkt-7e8391bf" },
	{ id: "lane3", x: 360, y: 90, texture: "mkt-085ffe82" },
] as const;

export const LANE1 = {
	// y580, not 566: the checkpoint is where a failed crossing puts you back, so it has to be
	// outside the hazard you just failed. At 566 Frankie's body (bottom-anchored, 28x14, so
	// y552-566) overlapped the southernmost pigeon row's own body (y544-558) by 6px -- standing
	// perfectly still at the respawn point got you run over roughly every 4s, five times in 20s,
	// with no input at all. The hazard's south edge measures between y572 and y576; 580 clears it
	// with margin, matching the 8px of clearance lane 3's checkpoint already has.
	checkpoint: { x: 360, y: 580 },
	crossingDepth: 112,
	// Bounded so a darting pigeon's own painted body never crosses into either side-wall stall's
	// footprint (LANE_WALL_BANDS: x<=175 and x>=460). A pigeon sprite is 44px wide with the bird
	// painted at local x7-35, anchored (0.5, 1) -- so it covers x-15..x+13 -- and its per-frame depth
	// out here in the open lane is just its own y, far below either stall's own depth, meaning any
	// overlap is drawn as a hard vertical slice through the bird rather than as it passing in front.
	// The old 180/455 put 10px of bird inside the west stall at every idle/walk/gap stop.
	stageLeft: 192,
	stageRight: 445,
} as const;
// The lane's five rows, moved south out of the canal. mkt-pigeon-* frames are 44x44 with the bird
// painted at local y8-34 and the sprite anchored (0.5, 1), so a pigeon at world y actually covers
// y-36..y-10 -- 34px ABOVE its own nominal position. The old top row (y482) sat 4px below the
// canal's south edge (MARKET_WATER_BANDS' 480) and therefore drew the entire bird over open water
// ("there is still a pigeon walking on water... just bring him down"), and the y498 row was barely
// better. Every row now starts at or below y516, the first y at which a pigeon's whole painted body
// clears the water (518 with a couple of px to spare), and the flock still fits between there and
// the yard fence's own art at y555.
export const PIGEON_ROUTES = [
	{ id: "pigeon-a", left: { x: LANE1.stageLeft, y: 518 }, right: { x: LANE1.stageRight, y: 518 } },
	{ id: "pigeon-b", left: { x: LANE1.stageLeft, y: 528 }, right: { x: LANE1.stageRight, y: 528 } },
	{ id: "pigeon-c", left: { x: LANE1.stageLeft, y: 538 }, right: { x: LANE1.stageRight, y: 538 } },
	{ id: "pigeon-d", left: { x: LANE1.stageLeft, y: 548 }, right: { x: LANE1.stageRight, y: 548 } },
	{ id: "pigeon-e", left: { x: LANE1.stageLeft, y: 558 }, right: { x: LANE1.stageRight, y: 558 } },
] as const;
// Where the flock settles once the lane is cleared. x170/465 used to sit just inside the two stalls'
// own footprint so laneActorDepth would floor their depth and draw them in front of the backdrop
// rather than behind it -- but "in front of the wall" is still standing ON the wall as far as the
// player is concerned ("the pigeon sprite is on the actual west wall indicator"). Perching outside
// the stalls entirely, on the same open-lane x the routes already use, needs no depth trick at all.
export const PIGEON_AMBIENT_PERCHES = [
	{ id: "pigeon-a", x: LANE1.stageLeft, y: 518, facing: "east" },
	{ id: "pigeon-b", x: LANE1.stageLeft + 14, y: 538, facing: "east" },
	{ id: "pigeon-c", x: LANE1.stageLeft, y: 558, facing: "east" },
	{ id: "pigeon-d", x: LANE1.stageRight, y: 528, facing: "west" },
	{ id: "pigeon-e", x: LANE1.stageRight - 14, y: 548, facing: "west" },
] as const;
// The two canals crossing the square, measured off market.tmj's own water tiles (every tile whose
// mean colour is the canal cyan). Nothing that reads as standing on the ground may have painted
// pixels inside these bands -- see PIGEON_ROUTES above and market-rules.test.mjs's own guard.
// maxY is exclusive -- the first row of dry ground, not the last row of water.
export const MARKET_WATER_BANDS = [
	{ minY: 240, maxY: 320 },
	{ minY: 400, maxY: 480 },
] as const;
// Where a pigeon's painted body sits relative to its own (0.5, 1) anchor, measured off the
// mkt-pigeon-idle/walking sheets' alpha channels: 44x44 frames, bird at local x7-35 / y8-34.
export const PIGEON_ART_BOUNDS = { left: -15, right: 13, top: -36, bottom: -10 } as const;
// The whole cycle used to spend 2700ms winding up before a 1600ms crossing, so the lane was mostly
// waiting and the dart itself was slower than a walking cart ("the pigeons are a little bit too
// easy to go past, maybe speed them up... especially in the transition, they seem to take a lot of
// time"). The wind-up is halved and the dart nearly doubled in speed; "gap" still clears
// pigeonGapMs's own computed safe-crossing minimum, so the lane is quicker without being unfair.
export const PIGEON_PHASES = [
	{ phase: "idle", durationMs: 500 },
	{ phase: "walk", durationMs: 700 },
	{ phase: "flap", durationMs: 450 },
	// Was 850ms (~490px/s across the ~416px lane) -- visibly faster than every other actor/hazard
	// in the game (Frankie 110px/s, a fleeing hen 68px/s, the cart ~264px/s). 1600ms brings it to
	// roughly the cart's own pace instead of a near-instant dash.
	{ phase: "dart", durationMs: 850 },
	// Was 3200ms -- pigeonGapMs's own required minimum (crossingDepth/playerSpeed + the shared
	// touch-crossing margin) works out to ~1919ms, so 3200 left ~1.3s of pure, unnecessary padding
	// on top of a safely-crossable gap ("it pauses for too long, the lane is too easy to pass").
	// 2100 keeps a real margin above the computed minimum without the extra idle time.
	{ phase: "gap", durationMs: 2000 },
] as const;
export const PIGEON_TUNING = {
	body: { width: 24, height: 14 },
	flockStaggerMs: 55,
	ambientWalkPx: 12,
	ambientPauseMs: 1400,
	// Still used by the ambient (post-clear) perch fade-in only -- the active lane's own
	// idle/gap transitions no longer hide or fade the pigeons at all (see PigeonLane.ts).
	fadeMs: 220,
} as const;
// The two side-wall backdrop images (mkt-d7f8b2d1 at world (7,55) 168x525, depth 580; mkt-e94844d4
// at world (460,38) 172x520, depth 558) span the full height of both the pigeon and cart lanes, but
// only within their own x-ranges. Market.ts's one-time depthSort() gives each a single depth from
// its own bottom edge -- correct for ordering against other static props, but wrong for a lane
// actor whose per-frame depth is its own (much smaller) y, which drew it behind these walls for its
// whole crossing. Flooring depth unconditionally across the whole lane would fix that but wrongly
// draw a lane actor in front of Frankie too (his own depth is just his y, always less than the
// walls' depth in these lanes) -- so the floor only applies within the walls' own x-bands. Frankie
// himself is kept out of these bands entirely by MARKET_SIDE_WALL_BLOCKERS below.
export const LANE_WALL_BANDS = [
	{ minX: 7, maxX: 175 },
	{ minX: 460, maxX: 632 },
] as const;
export const LANE_ACTOR_MIN_DEPTH = 581;

export function laneActorDepth(x: number, y: number): number {
	return LANE_WALL_BANDS.some((band) => x >= band.minX && x <= band.maxX) ? Math.max(y, LANE_ACTOR_MIN_DEPTH) : y;
}

// These two stall structures are drawn as flat backdrop images with no collider of their own at
// all -- Frankie could walk straight through/behind them. They read as solid market stalls, so
// their full footprint blocks him, matching LANE_WALL_BANDS above exactly.
export const MARKET_SIDE_WALL_BLOCKERS = [
	{ x: 7, y: 55, width: 168, height: 525 },
	{ x: 460, y: 38, width: 172, height: 520 },
] as const;
export const PIGEON_ANIMATIONS = {
	idleEast: { key: "mkt-pigeon-idle-east", texture: "mkt-pigeon-idle", startFrame: 17, endFrame: 25, frameRate: 9 },
	idleWest: { key: "mkt-pigeon-idle-west", texture: "mkt-pigeon-idle", startFrame: 34, endFrame: 42, frameRate: 9 },
	flapEast: { key: "mkt-pigeon-flap-east", texture: "mkt-pigeon-idle", startFrame: 51, endFrame: 67, frameRate: 12 },
	flapWest: { key: "mkt-pigeon-flap-west", texture: "mkt-pigeon-idle", startFrame: 68, endFrame: 84, frameRate: 12 },
	walkEast: { key: "mkt-pigeon-walk-east", texture: "mkt-pigeon-walking", startFrame: 9, endFrame: 17, frameRate: 9 },
	walkWest: { key: "mkt-pigeon-walk-west", texture: "mkt-pigeon-walking", startFrame: 18, endFrame: 26, frameRate: 9 },
} as const;

export const LANE2 = {
	checkpoint: { x: 360, y: 410 },
	rope: { x: 360, y: 329 },
	blocker: { x: 311, y: 304, width: 98, height: 18 },
} as const;
export const MARKET_SYMBOLS = ["feather", "egg", "apple"] as const satisfies readonly MarketSymbol[];
// These three sign panels (mkt-c3e2b055/cfb0fa85/2ea31bc4 in Market.ts's editorCreate) are the
// round's "look here" cue: lit in sequence during presentation. They are NOT stepped on -- input
// happens at the basket stand (MEMORY_BASKETS below) instead. The glow that marks each one as "lit"
// is a Phaser Filters.Glow traced on the panel's own art (see MemoryLane.ts) rather than a drawn
// shape at a separately-tracked position, so their world positions live only in Market.ts's own
// editorCreate now.
export const MEMORY_PANEL_TEXTURES = {
	feather: "mkt-c3e2b055",
	egg: "mkt-cfb0fa85",
	apple: "mkt-2ea31bc4",
} as const satisfies Record<MarketSymbol, string>;
// Market.ts's generated depthSort() gives each panel a fixed depth from its own bottom edge
// (356-401, matching Frankie's own typical y when walking this part of the square) -- correct for
// ordering against other static props, wrong for a flat ground plaque Frankie should always walk in
// front of. Floored low so he never draws behind them ("Frankie can now go underneath the rug").
export const MEMORY_PANEL_DEPTH = 10;
// Market.ts's editorCreate places these three independently of each other and of the basket stand
// below them -- egg (y327) landed a full lane north of feather/apple (y370-372, right at the south
// water edge's own trim), reading as two stray rugs plus one sitting in the wrong lane entirely
// ("align the rugs, the feather is falling off the sidewalk"). Runtime re-positions all three into
// one row, clear of both water edges, keeping their existing left-to-right x spacing (already
// matching the basket order below).
// 54px apart rather than 74. The old row spanned x268-459; standing at the feather basket on a
// phone put the apple rug off the right edge of the screen entirely, so after entering a round you
// could not see what the next one had just replayed ("I can't really see the red apple rug... it's
// a little bit hard to tell exactly what was the first in the sequence"). Tightening helps on
// desktop, but the row physically cannot fit beside a stall that is 130px wide on a 355px-wide
// view -- which is why the sequence is ALSO echoed on the baskets themselves while it plays (see
// MemoryLane's setMatLit). The rugs are the landmark; the baskets are the readable copy.
export const MEMORY_PANEL_POSITIONS = {
	feather: { x: 262, y: 355 },
	egg: { x: 316, y: 355 },
	apple: { x: 370, y: 355 },
} as const satisfies Record<MarketSymbol, { x: number; y: number }>;

// The three sign panels came out of the generic PixelLab collider pipeline as solid, the same bug
// class already fixed once for the market arch and the coop doorway -- Frankie doesn't interact
// with them at all now, but a wall-mounted sign panel still has no business physically blocking
// him. These bounds match Market.COLLIDERS' own generated boxes for those three panels exactly.
export const MEMORY_MAT_BLOCKERS = {
	feather: { x: 275, y: 388, width: 28, height: 13 },
	egg: { x: 348, y: 343, width: 28, height: 13 },
	apple: { x: 422, y: 386, width: 28, height: 13 },
} as const satisfies Record<MarketSymbol, { x: number; y: number; width: number; height: number }>;

// Frankie's actual input: the 3-basket stand already sitting in the room's own art (mkt-8afaf6af,
// placed at world (148,264), 128x89) -- feather/egg/apple left-to-right, matching the sign panels'
// own left-to-right reading order. Frankie presses E at the basket matching the lit sign, in the
// order the signs lit up.
//
// Measured off the stand's own PNG by isolating each icon panel's painted background colour
// (198,135,62): the three panels' centres are 29px apart at world x183 / x212 / x241, y328. The
// feather entry was previously 178 -- 5px off its own panel, which is exactly the kind of small
// mismatch that reads as "the icons are offset".
// The memory booth only starts playing once Frankie is standing in its lane.
//
// It used to arm the moment Pierre had been spoken to, which is at the far south end of the market:
// by the time you had herded the hens, crossed the pigeon lane and walked up here, the booth had
// been cycling rounds to an empty room for a minute, and you arrived partway through a sequence you
// had no way to have watched. Presenting to nobody is also what made the "WATCH" readout confusing
// on arrival -- it was telling the truth about a round you had already missed.
//
// Bounded north by the booth/rope row's own colliders (MEMORY_BOOTH_BLOCKER and LANE2.blocker both
// bottom out by y353) and south short of lane 1's sugar cube at y441, so walking up to the booth
// starts a round and standing at lane 1 does not. Leaving the box suspends the round; walking back
// in replays it from its first symbol rather than dropping you mid-sequence again.
export const MEMORY_LANE_TRIGGER = { x: 150, y: 336, width: 280, height: 104 } as const;
export const MEMORY_BASKETS = {
	feather: { x: 183, y: 328 },
	egg: { x: 212, y: 328 },
	apple: { x: 241, y: 328 },
} as const satisfies Record<MarketSymbol, { x: number; y: number }>;
// The basket stand's own image came out of the generic collider pipeline as this box. Runtime
// removes it and adds the measured MEMORY_BOOTH_BLOCKER below in its place.
export const MEMORY_BASKET_STAND_BLOCKER = { x: 171, y: 314, width: 82, height: 39 } as const;
// The stand's real solid mass, measured off its own alpha channel: the counter front and both legs
// run x161-275 / y316-353 (everything above y320 is already inside the canal's own solid tiles, so
// a blocker up there does nothing). The previous box sat at y264-314 -- entirely inside that
// already-solid canal band -- which left the counter itself with no collider at all: Frankie walked
// straight into the stand and, being at a smaller y than the stand's own depth, vanished behind it
// ("still clip through the memory booth"). This box stops her at y367, just south of the stand's
// painted bottom edge (352), so she is both blocked by it and correctly drawn in front of it.
export const MEMORY_BOOTH_BLOCKER = { x: 156, y: 314, width: 120, height: 39 } as const;
// Market.ts's depthSort() gives the stand image depth 353 (its canvas bottom). A basket marker
// drawn at the basket's own y (328) therefore sorted *behind* the stand and was simply never
// visible, leaving the player with a bare interact badge floating over the stall and nothing
// marking which basket it belonged to ("no interaction with baskets and the interaction and icons
// are still offset"). These markers are a gameplay readout, not scenery -- they sit above the whole
// world, just under InteractionManager's own badge (9000), so Frankie standing at the counter can't
// hide them either.
export const MEMORY_BASKET_DEPTH = 8500;
// The lit halo behind each sign panel. Additively blended in the panel's own symbol colour, so the
// feather rug glows light blue and the apple rug light red -- the scale pop alone left which rug was
// lit ambiguous at a glance.
export const MEMORY_GLOW = { padding: 10, restAlpha: 0, litAlpha: 0.85, litScale: 1.1 } as const;
export const MEMORY_BASKET_TUNING = {
	// MEMORY_BOOTH_BLOCKER stops Frankie's 14px-tall body at y367, 39px south of the basket icons --
	// the closest she can physically get without being drawn behind the stand. The radius has to
	// clear that or no basket is ever reachable, which is why the old 16 meant "no interaction with
	// baskets" no matter where she stood. Overlap between neighbouring baskets is harmless:
	// InteractionManager's nearestInRange still picks the single closest one, and at 29px spacing the
	// nearest basket is always the one she's standing in front of.
	interactRadius: 44,
	// A faint marker at rest, near-full brightness when correctly pressed; the wrong-basket flash
	// uses MEMORY_TIMING.incorrectMs's own red, matching the sign panels' own replay-flash color.
	// Small (the icon panels themselves are only ~15px wide) so the marker reads as sitting on its
	// basket rather than blanketing the stall.
	radius: 9,
	restAlpha: 0.35,
	// A correct press turns the marker green rather than just brightening its own symbol colour --
	// "the little white circles fill in" read as ambiguous next to the red wrong-answer flash.
	correctColor: 0x63c96a,
	// While the pattern is playing the baskets are not the thing to look at, and pressing one only
	// cuts the presentation short. Dimming them and lifting them back to full on "YOUR TURN" is the
	// clearest possible statement of whose move it is.
	waitingAlpha: 0.5,
	correctAlpha: 1,
	correctScale: 1.35,
	incorrectAlpha: 0.9,
	// Measured from the badge's own pointing tip now (see InteractionManager's BADGE_TIP), not its
	// container centre, so this is literally "how far above the basket the tail floats". 72 put it
	// above the whole stall, reading as "really high up compared to the actual baskets"; 20 sits it
	// just over the basket's lid, close enough to pair with the marker on the icon below it.
	indicatorOffset: 20,
} as const;

export const MEMORY_ROUNDS = [
	["feather", "egg", "apple"],
	["apple", "feather", "egg", "apple"],
	["egg", "apple", "feather", "egg", "apple"],
] as const satisfies readonly (readonly MarketSymbol[])[];
export const MEMORY_TIMING = {
	startDelayMs: 400,
	litMs: 420,
	darkMs: 260,
	acceptedPulseMs: 140,
	incorrectMs: 220,
	// Long enough to read as "that round is done" before the next pattern starts playing. At 700 the
	// next WATCH began almost on top of the last correct press, which is what made the start of a
	// round hard to spot.
	roundCompleteMs: 1500,
	// If Frankie hasn't pressed a basket this long after a round finishes presenting, replay it --
	// otherwise a player who missed the pattern the first time is just left standing there with no
	// way to see it again short of failing a guess on purpose.
	idleReplayMs: 6000,
} as const;
export const MEMORY_ROUND_LABELS = ["Round 1/3", "Round 2/3", "Round 3/3"] as const;
// A permanent status line above the stand. Without it the minigame gives no answer to "has it
// started?", "is it still showing me the pattern?" or "how far through am I?" -- the rugs just light
// up on their own schedule and the baskets silently accept or reject ("it's kind of hard to know
// when to actually start or what's the starting point for the sequence"). WATCH/YOUR TURN name the
// phase, and the pips count out how much of this round's sequence is already entered.
export const MEMORY_STATUS = {
	// x245, not the basket stand's own centre (212): this is world-space text, so on a 390px phone
	// at zoom 1.1 the visible world is only ~355px wide and centred on Frankie. Standing at the
	// left-hand feather basket (x183) put the line's left half off the screen edge -- the one
	// readout telling you whether to watch or to answer. 245 stays on screen from all three
	// baskets.
	x: 245,
	y: 248,
	depth: 8600,
	watch: "WATCH",
	yourTurn: "YOUR TURN",
	// The pips are drawn as real circles now, not as the text glyphs the label line used to carry.
	// Phaser Text has no per-character colour, so an entered pip could only ever be the same cream
	// as the rest of the line -- while the basket you had just pressed went green
	// (MEMORY_BASKET_TUNING.correctColor). Two readouts of the same fact, disagreeing about whether
	// it was a success. They are the same green as the baskets now, and an un-entered pip is a hollow
	// ring in the label's own cream, so the row reads left-to-right as "filled in so far".
	pip: {
		radius: 4,
		spacing: 13,
		// Below the "Round n/3  WATCH" line, which is 13px text drawn from its own centre.
		offsetY: 15,
		// Literally the baskets' own green, so the two readouts cannot drift apart again.
		doneColor: MEMORY_BASKET_TUNING.correctColor,
		todoColor: 0xfff4d6,
		todoAlpha: 0.18,
		strokeColor: 0xfff4d6,
		strokeWidth: 1.5,
		strokeAlpha: 0.85,
		popScale: 1.4,
		popMs: 160,
	},
} as const;
export const ROPE_ANIMATION = {
	key: "mkt-rope-drop",
	texture: "mkt-rope",
	closedFrame: 0,
	startFrame: 9,
	usableFrame: 14,
	openFrame: 17,
	frameRate: 9,
} as const;

// A cart sprite is a 64px frame with the cart painted at local x1-61, anchored (0.5, 1) -- so it
// covers x-31..x+29, not the x-32..x+32 the frame suggests. fromX/toX are bounded so that painted
// span never reaches into either side-wall stall's footprint (LANE_WALL_BANDS: x<=175 and x>=460).
// Out here the cart's per-frame depth is just its own y (220), far below either stall's own depth
// (558/580), so any overlap isn't "emerging from behind the stall" -- it's the cart being sliced off
// down a hard vertical line. The old fromX 180 put 26px of cart inside the west stall for the whole
// warning phase and both ends of every crossing ("cart still clips west terrain on the left side").
export const LANE3 = {
	checkpoint: { x: 360, y: 242 },
	route: { fromX: 208, toX: 428, y: 220 },
	parking: { x: 208, y: 220 },
} as const;
export const CART_CROSSING_DEPTH = LANE3.checkpoint.y - SUGAR_CUBES[2].y;
// Two crossings per cycle, not one -- the lane was not a timing challenge with one.
//
// The cart is a 60px-wide body sweeping at 220px/s, so at the column Frankie actually crosses on
// (x360) it is only physically in the way for ~400ms. Against a single crossing per 4400ms cycle
// that made mistiming almost impossible: a scripted run crossed 10/10 including both worst phase
// boundaries, because the crossing lasts 1000ms but the *hazard at your own x* does not.
//
// Lengthening the crossing would just make the cart trundle again (already rejected). Instead the
// cart goes out and comes straight back, with a short "warning" as its turnaround rather than a
// full one. The return pass is what closes the lane's cheapest exploit: watch the cart go by, step
// out behind it, walk across. That start is now inside the danger band rather than at the edge of
// it. Waiting for the long dust-free "gap" is the correct read, and it is still comfortably safe
// (see the gap comment below).
//
// Dust is the tell, and it plays on BOTH warnings: dust means a cart is about to move, no dust
// means it is parked. The gap is the only long stretch without it.
//
// Measured by scripted crossings at 24 evenly-spaced starts across the cycle
// (scripts/tests/manual-test-lane3.mjs): 6/24 fail, in one contiguous band running from partway
// through the opening warning to partway through the turnaround, with everything from the return
// crossing onward safe. Lane 1 -- untouched, and the lane this one is calibrated against rather
// than against a made-up target -- measures 6/24 on the same harness, in the same one-band shape.
// So lane 3 is now exactly as demanding as its sibling, where it used to be free.
export const CART_PHASES = [
	{ phase: "warning", durationMs: 1000 },
	// 220px in 1000ms (220px/s, twice Frankie's own 110) -- was 1800ms for a 275px run, i.e. 153px/s,
	// which read as the cart trundling rather than crossing ("needs to be faster in transition").
	{ phase: "crossing", durationMs: 1000 },
	// The turnaround. Deliberately far shorter than the opening warning: this is the return pass you
	// are supposed to get caught by if you followed the cart out, not a second invitation to cross.
	{ phase: "warning", durationMs: 450 },
	{ phase: "crossing", durationMs: 1000 },
	// CART_CROSSING_DEPTH/MARKET_PLAYER_SPEED + TOUCH_CROSSING_MARGIN_MS works out to ~2282ms as the
	// real minimum safe-crossing gap; 2400 keeps a margin above it without the extra idle time the
	// old 3200 padded on top ("it pauses for too long, the lane is too easy to pass"). Unchanged by
	// the return pass above -- a player who waits for the gap is exactly as safe as before, which is
	// the point: the lane got harder to rush, not harder to solve.
	{ phase: "gap", durationMs: 2400 },
] as const;
// Where a cart's painted body sits relative to its own (0.5, 1) anchor, measured off mkt-cart's own
// alpha channel: 64x64 frames, cart at local x1-61 / y12-61.
export const CART_ART_BOUNDS = { left: -31, right: 29, top: -52, bottom: -3 } as const;
export const CART_TUNING = {
	// Sized and placed off CART_ART_BOUNDS rather than guessed. The old 40x24 box was 20px narrower
	// than the painted cart, so both wheels overhung it: the cart could visibly roll over Frankie
	// without the overlap ever firing, and while parked he could stand inside its own wheels. Width
	// is the full painted span; height stops 9px short of the art's top so the canopy still reads as
	// something to walk behind rather than a wall.
	body: { width: CART_ART_BOUNDS.right - CART_ART_BOUNDS.left, height: 40 },
	// x dropped -- the cart now warns from whichever side it's about to cross from (see CartLane's
	// endpoints()), not always LANE3.route.fromX.
	warningCue: { y: LANE3.route.y, radius: 10 },
	dustIntervalMs: 140,
} as const;
export const CART_ANIMATION = {
	key: "mkt-cart-roll",
	texture: "mkt-cart",
	parkedFrame: 17,
	startFrame: 9,
	endFrame: 17,
	frameRate: 9,
} as const;

export const LANE_CHECKPOINTS = {
	lane1: LANE1.checkpoint,
	lane2: LANE2.checkpoint,
	lane3: LANE3.checkpoint,
} as const;
// Being run over used to be a 180ms fade to black and back with nothing else attached, which reads
// as the screen blinking rather than as a hit -- the one moment the lane has to tell you that you
// got it wrong, and it said nothing. The hit now lands before the fade starts: Frankie stops dead,
// the camera shakes, and the screen flashes the same red the memory booth uses for a wrong answer,
// held long enough to register as an event before the recovery fade takes over.
export const LANE_RESET_TIMING = {
	shakeMs: 220,
	// Phaser shake intensity is a fraction of viewport size, so this is ~4px on a 360px-wide view --
	// a jolt, not a screen-wrecker.
	shakeIntensity: 0.012,
	flashMs: 300,
	flashColor: { r: 200, g: 91, b: 77 },
	// The flash has to finish before the fade to black starts, or the two overlays cancel into a
	// muddy grey and the whole thing goes back to reading as a blink.
	holdMs: 320,
	fadeOutMs: 180,
	fadeInMs: 180,
} as const;

export const SUGAR_PICKUP_TUNING = {
	// Wider interact area than the glow itself -- the glow is a visual cue, not a hitbox, and the
	// previous pass made both the same size (24), reading as "the interact area floats above the
	// object" once the glow's own visible edge no longer matched where the press actually worked.
	interactRadius: 30,
	haloRadius: 16,
	haloAlpha: 0.45,
	haloPulseScale: 1.2,
	haloPulseMs: 900,
	bobDistancePx: 2,
	bobDurationMs: 850,
	sparkleMinOffsetPx: 2,
	sparkleMaxOffsetPx: 3,
	sparkleIntervalMs: 700,
	pickupDurationMs: 220,
} as const;
export const SUGAR_PROGRESS_LABELS = ["1/3", "2/3", "3/3"] as const;
export const MARKET_REWARDS = {
	eggs: { ingredient: "eggs", texture: "bkry-icon-eggs-basket", label: "Eggs!" },
	sugar: { ingredient: "sugar", texture: "bkry-icon-sugar-sack", label: "Sugar!" },
} as const;

export const PIERRE_DIALOGUE = {
	intro: [
		{
			speaker: "Pierre",
			text: "Hello, Frankie! A cake for Michell? I'd love to help. Bring the three hens back to their coop for eggs, and collect three sugar cubes from the games. You can do either one first.",
		},
	],
	hens: [
		[{ speaker: "Pierre", text: "The three hens are out in the yard. Open their gate and gently guide them home. I'll keep the eggs ready for you." }],
		[{ speaker: "Pierre", text: "One hen home! Just two more. You're doing well, Frankie." }],
		[{ speaker: "Pierre", text: "Two hens home. Just one little wanderer left. Take your time." }],
	],
	eggsHandoff: [
		{ speaker: "Pierre", text: "All three home! Thank you, Frankie. They look happy to be back." },
		{ speaker: "Pierre", text: "Here are your eggs. Give Michell a birthday bark for me! I hope you get a very nice treat for all this." },
		{ speaker: "Pierre", text: "Once your sugar is sorted, go see Panini for butter. Her flat is upstairs across the street from yours." },
	],
	sugar: [
		[{ speaker: "Pierre", text: "There are three sugar cubes to collect from the games up ahead. Try one at a time. No hurry." }],
		[{ speaker: "Pierre", text: "One sugar cube found! Two more to go. You're getting there." }],
		[{ speaker: "Pierre", text: "Two sugar cubes! Just one more for the cake." }],
		[{ speaker: "Pierre", text: "All three sugar cubes. Well done, Frankie!" }],
	],
	complete: [
		{ speaker: "Pierre", text: "That's the eggs and sugar ready. Panini has the butter at her flat, upstairs across the street. Then it's home to make Michell's cake!" },
	],
	/** The day after: the cake is made, the market is just a market again. */
	afterCake: [
		{ speaker: "Pierre", text: "Hello again, Frankie! How did Michell like her cake? I bet she loved it." },
		{ speaker: "Pierre", text: "Stay a little if you like. It's nice having you here." },
	],
	setbacks: {
		lane1: [{ speaker: "Pierre", text: "Those pigeons do get in the way. Wait for a clear gap, then try again. You've got this." }],
		lane3: [{ speaker: "Pierre", text: "Careful of the cart, Frankie. Let it pass, then have another go." }],
	},
} as const satisfies {
	intro: readonly DialogueLine[];
	hens: readonly (readonly DialogueLine[])[];
	eggsHandoff: readonly DialogueLine[];
	sugar: readonly (readonly DialogueLine[])[];
	complete: readonly DialogueLine[];
	afterCake: readonly DialogueLine[];
	setbacks: Record<"lane1" | "lane3", readonly DialogueLine[]>;
};
