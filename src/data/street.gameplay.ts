import { DialogueLine } from "../systems/DialogueSequencer";
import { Door } from "../systems/SceneTransition";

// Street is now the hub between Apartment and Bakery (previously a direct door) -- these four
// door positions were measured against Street.COLLIDERS' actual building boxes (each
// building's own opaque-bottom collider, not its full facade bounds), placed just south of each
// building's collider edge so Frankie can actually stand there. See street.gameplay.test notes
// below each door for the specific building it's paired with.

// Bakery facade collider bottom-edges at y=523, centered x~358 -- door sits just south of it,
// slightly left of center to line up with the drawn door in the art (not the facade midpoint).
// enterFacing: every door in the game sits on a horizontal wall and is meant to be entered head-on.
// Without it, brushing along the wall sideways while the radius overlaps teleports you out of the
// room ("you can sometimes enter and exit areas by walking sideways").
export const STREET_DOOR_TO_BAKERY: Door = { x: 343, y: 531, radius: 10, target: "Bakery", spawnId: "fromStreet", enterFacing: "north" };
// Where Frankie appears in Street after walking OUT of the bakery's own door.
// Arrival spawns sit a clear step SOUTH of their own doorway, not on it. These used to land 8px
// from a radius-10 door -- inside its own trigger, and (at y523/y690, the facades' own collider
// bottom edges) overlapping the wall itself, so Frankie was pushed out by the physics step on
// arrival. That is the "shoved right at the door" feeling. y+28 clears the facade (her body's north
// edge must reach the wall's bottom edge, 14px below her own anchor) and leaves ~18px outside the
// door radius, so the doorway reads as something she just stepped out of.
//
// Raised from +20 to +44 after a playtest walked straight back into every room it had just left:
// at 20px, with `facing` still pointing at the door (a scene-instance field that survives the room
// change -- now reset by attachGameplay's faceAndSpawn), the first frame of forward input was
// already inside a radius-10 trigger. 44px is ~0.4s of deliberate walking, so re-entering is a
// choice rather than an accident, while still reading as "just outside the door".
export const STREET_SPAWN_FROM_BAKERY = { x: 343, y: 575 };

// Apartment facade collider bottom-edge at y=690, centered x~629 -- door sits just south of it,
// slightly left of center matching the drawn door.
export const STREET_DOOR_TO_APARTMENT: Door = { x: 601, y: 698, radius: 10, target: "Apartment", spawnId: "fromStreet", enterFacing: "north" };
export const STREET_SPAWN_FROM_APARTMENT = { x: 601, y: 742 };

// The generated fallback collider for the market building (x534-675,y140-232 -- its own
// sourceJson has no foot shape, the same failure mode already fixed once for the Market scene's
// own arch and coop doorway) spans the WHOLE archway opening, not just its two side pillars. Left
// in place, it blocked Frankie from ever getting more than a couple px into the opening. Removed
// here; STREET_MARKET_PILLAR_BLOCKERS below replaces it with two boxes matching just the pillars.
export const STREET_MARKET_ARCH_PASSAGE_BLOCKER = { x: 534, y: 140, width: 141, height: 92 } as const;
// Measured off the facade's own source PNG (a603d760, world (495,24,220,208)): the painted opening
// between the two stone pillars spans local x60-155 (world 555-650) at every row, top to bottom.
// Without a replacement for the box just removed above, that whole 220px-wide facade had NO
// collider at all -- Frankie could walk straight through the solid pillar art on either side of the
// opening ("it places me in a spot where I can phase through the market wall"). These two boxes
// cover only the real pillars, leaving the measured gap fully open.
// Grown 10px inward each side, so the walkable gap (565-640) is narrower than the door trigger that
// sits in it rather than wider. At the measured opening (555-650) against a radius-14 door, only
// ~27px of a 95px passage actually led anywhere: walking north anywhere else took Frankie 50px PAST
// the door into a dead pocket where the facade (depth 232) drew over him entirely, and he could
// walk around in there invisible.
export const STREET_MARKET_PILLAR_BLOCKERS = [
	{ x: 495, y: 140, width: 70, height: 92 },
	{ x: 640, y: 140, width: 75, height: 92 },
] as const;
// arrowOffsetY -140 (not the default -18) puts the bobbing arrow up at the arch's own visual
// crown/banner -- the collider's own top edge (y140) is tighter than the actual painted arch,
// which reads (by eye, confirmed in a live screenshot) as extending up to roughly y100.
//
// radius was 60 -- wide enough to swallow most of the open gap between the two pillars, unlike
// every other door in the game (6-10px). That's what let STREET_SPAWN_FROM_MARKET land back inside
// its own trigger and made the arch fireable from well short of actually reaching it. Now that the
// pillars themselves are solid (STREET_MARKET_PILLAR_BLOCKERS), a small radius centered on the real
// gap is enough to find reliably, matching every other door's own tightness.
// radius 40 spans the whole walkable gap between the pillars above (565-640 vs the trigger's
// 564-644), so every route through the arch reaches the Market. A door in a 75px-wide archway is
// not the same object as a door in a doorway, and sizing it like one is what created the pocket.
// STREET_SPAWN_FROM_MARKET at y292 is still 52px away, outside it.
export const STREET_DOOR_TO_MARKET: Door = { x: 604, y: 240, radius: 40, target: "Market", spawnId: "fromStreet", arrowOffsetY: -140, enterFacing: "north" };
// 52px clear of the arch's own radius-14 trigger (see STREET_SPAWN_FROM_BAKERY for why that
// clearance was widened), and still north of the market row's colliders, which start at y306.
export const STREET_SPAWN_FROM_MARKET = { x: 604, y: 292 } as const;

// Panini's iron stair base -- collider bottom-edge at y=475, centered x~974, but the stair
// itself sits on the left portion of the facade (see the art), not the building's midpoint.
// The stair now connects to the imported PaninisFlat interior.
export const STREET_DOOR_TO_PANINIS: Door = { x: 904, y: 483, radius: 10, target: "PaninisFlat", spawnId: "fromStreet", enterFacing: "north" };
export const STREET_SPAWN_FROM_PANINIS = { x: 904, y: 527 };

// Ambient wildlife -- purely decorative, no interact zone, no dialogue.
// Both species are placed where the PixelLab Street map export
// (public/assets/scenes/street-pixellab/src/engine-map.json) put them, so the runtime scene
// matches the map as authored. In that file the three wildlife entries are the objects named
// "Idle" (description "Character: ..."); their x/y is the top-left of the sprite's bounding box,
// while the sprites here are drawn with origin (0.5, 1), so each position below is that box's
// bottom-centre.

// Export box (684, 454) 24x24 -> bottom-centre (696, 478). That is the pond's south-east shore,
// tucked in behind the three rocks at (696, 465), (687, 471) and (696, 475) -- the stork's depth
// is its own y (478) and depthSort gives those rocks 481/487/491, so it reads as standing behind
// them rather than on top. It was previously at (700, 340), up by the north-east tree instead.
export const STORK_POSITION = { x: 696, y: 478 };

// The two pigeons peck around the bottom-left plaza -- the street's biggest open, bare area.
// This box is where their wander AI picks random waypoints; it covers the
// clear brick west of the café seating and south of the market row.
//
// The wander AI has no obstacle avoidance (a straight-line tween, see createPigeon), so the box
// has to be clear of collider ground by construction, not just visually roomy. Everything that
// borders it is outside it: the market stall foot (242-273, 606-627), the noticeboard foot
// (288-319, 604-625) and the planter foot (332-352, 612-626) all end above y=629, the café
// chairs/tables start at x=358, and the west wall ends at x=112.
export const PIGEON_WANDER_BOUNDS = { x: 224, y: 629, width: 130, height: 61 };

// Starting spot and initial facing per pigeon, again from the export's own "Idle" entries:
// boxes (291, 650) 16x16 and (255, 666) 16x16. Spawning them apart (rather than both at the box
// centre) keeps them from overlapping into what looks like a single bird on the first frame.
export const PIGEON_STARTS = [
	{ x: 299, y: 666, facing: "east" as const },
	{ x: 263, y: 682, facing: "south" as const },
];


// The window box: the two planters under the apartment's street window (str-1fc47a2b at 642,674
// and str-8417388e at 671,674). Frankie can't water anything, but he can nose at it every time he
// passes, and it grows over visits -- sprout, bud, bloom -- entirely off a counter. It's the
// cheapest mechanic in the design doc (§6, "the window box") and the one that makes the ending
// different for a player who bothered: bloom before the cake and Michell finds the flower on top.
// Zone at the pavement in front of the planters; the flower sprite sits in the left box.
export const WINDOW_BOX = {
	zone: { x: 672, y: 716, radius: 40, indicatorOffset: 48 },
	/** The flower props are 48px map objects; the planter is ~20px tall, so they are drawn small. */
	flower: { x: 658, y: 688, scale: 0.6 },
	/** Visits needed to reach each stage. */
	stages: [
		{ at: 1, texture: "flower-sprout" },
		{ at: 3, texture: "flower-bud" },
		{ at: 4, texture: "flower-bloom" },
	],
} as const;
export const WINDOW_BOX_LINES: DialogueLine[][] = [
	[{ speaker: "Frankie", text: "A little green shoot! I nose the soil about a bit. Encouragement.", thought: true }],
	[{ speaker: "Frankie", text: "Two leaves now. Warm dog breath is basically a greenhouse.", thought: true }],
	[{ speaker: "Frankie", text: "A bud. Pink, at the tip. Come on, come on.", thought: true }],
	[{ speaker: "Frankie", text: "It opened! A whole flower. Under her window. She'll see it from the desk.", thought: true }],
	[{ speaker: "Frankie", text: "Still blooming. Still mine. Well. Hers.", thought: true }],
];
