import { DialogueLine } from "../systems/DialogueSequencer";
import { Door } from "../systems/SceneTransition";
import type { Rect } from "../systems/pathfinding";

export const TEDDY_POSITION = { x: 321, y: 194 };
export const TEDDY_INTERACT_RADIUS = 44;

// The 3 supplies Teddy sends Frankie to find. No fixed position of their own any more -- each
// one is hidden in a random HIDING_SPOT for the session (see attachGameplay.ts), not sitting
// visibly out on the floor.
export const FETCH_ITEMS = [{ id: "wooden-spoon" }, { id: "oven-mitt" }, { id: "measuring-cup" }];

// Where Frankie searches for each of the 3 supplies. All 3 spots are existing room furniture
// (see Bakery.ts's generated COLLIDERS) rather than a dedicated container sprite
// (containerTexture, still supported below for anything future that actually needs one) --
// a crate and a barrel plopped in the open floor of the dining aisle read as clutter dumped
// in the walkway rather than something that belongs in a bakery. x/y for each is the piece of
// furniture's own visual center, not a top-left-origin sprite position, so the search radius
// lines up with where it visibly is. Spacing keeps every spot's own 32px interact radius clear
// of every other spot's and of Teddy's 44px one, so no two zones can straddle each other. One
// spot per FETCH_ITEMS entry: attachGameplay.ts shuffles the assignment once per session.
// Typed explicitly (not inferred from the literal below) so containerTexture stays a real,
// optional field -- every current entry omits it, and without this annotation TypeScript would
// narrow the array's type to exclude it entirely, breaking the container-sprite branch in
// attachGameplay.ts for the next spot that actually needs one.
// x/y is each piece of furniture's own COLLIDER centre (read back off the live scene's static
// bodies), not its art centre and not an eyeballed point on the sprite. That distinction is the
// whole bug: Frankie's position is her feet, and the furniture's collider is what decides how close
// those feet can get, so a zone centred anywhere else is only reachable from the sides where the
// offset happens to point. The chair's old x171 sat 11px east of its own collider (x144-175), which
// put it 41px away from the only spot Frankie can stand on its west side -- outside the radius
// entirely -- and the plant's old anchor was similarly only reachable from one side. Both read as
// "the pickup hitbox is north of the actual object".
// `artTexture` names the generated scene's own image for the spot, which becomes the touch tap
// target: a player taps the basket they can see, and the old 40px square centred on the collider
// missed the top of the basket art entirely ("very difficult to interact with the bread basket").
export const HIDING_SPOTS: { id: string; x: number; y: number; reachBounds: Rect; containerTexture?: string; artTexture?: string }[] = [
	{ id: "wicker-basket", x: 110, y: 207, reachBounds: { x: 94, y: 196, width: 31, height: 21 }, artTexture: "bkry-239e9866" },
	{ id: "chair", x: 160, y: 269, reachBounds: { x: 144, y: 258, width: 31, height: 21 }, artTexture: "bkry-c050a0c1" },
	{ id: "plant", x: 408, y: 317, reachBounds: { x: 392, y: 306, width: 31, height: 21 }, artTexture: "bkry-cd7a4658" },
];
// Frankie's body is 28x14 and these colliders are ~31x21, so walking straight into one from any
// cardinal direction leaves her centre ~30px from its own centre. The old 32 cleared that by two
// pixels on a good approach and not at all on a diagonal one, which is why picking these up was
// fiddly. 40 covers every approach including the corners; overlapping neighbours are harmless
// because InteractionManager resolves by exact distance, not by first match.
export const HIDING_SPOT_INTERACT_RADIUS = 40;

export const teddyBusyLines = (remaining: number): DialogueLine[] => [
	{ speaker: "Teddy", text: `Flour for the birthday cake, of course! Lovely to see you, Frankie! Could you help me find ${remaining} more suppl${remaining === 1 ? "y" : "ies"} around the shop? Then I'll have your flour ready.` },
];

export const TEDDY_HANDOVER_LINES: DialogueLine[] = [
	{ speaker: "Teddy", text: "That's the lot! You're a very good dog, Frankie. One bag of flour, fresh off the shelf." },
	{ speaker: "Teddy", text: "You'll need eggs and sugar next. You'll find Pierre at the market. Head outside and follow the street to the market entrance. Tell him I sent you!" },
	{ speaker: "Teddy", text: "Michell has always liked a little birthday fuss, even when she says she doesn't. This will mean a lot to her." },
];

// Talking to Teddy again after he's already handed over the flour used to replay the full
// handover line (and re-fire the "Flour!" pickup reveal) every time -- an infinite, meaningless
// re-grant. This is the short repeat instead.
export const TEDDY_ALREADY_GIVEN_LINES: DialogueLine[] = [{ speaker: "Teddy", text: "Flour's all yours! Go on, make her day." }];
/** The day after the cake. */
export const TEDDY_AFTER_CAKE_LINES: DialogueLine[] = [
	{ speaker: "Teddy", text: "Rafa told me about the cake. Made with love, was it? That's the best ingredient." },
	{ speaker: "Teddy", text: "Come by tomorrow and we'll bake something together. I'll save you a spot." },
];

// The floor's wall boundary is a hard collider at y=336 (the door art sits just past it,
// decorative like the apartment's) -- centered right at that boundary with a small radius so
// this only fires once Frankie is actually pressed against the wall above the door, not from
// generally nearby.
// Target changed from Apartment to Street when Street became the hub between
// Apartment and Bakery -- this door's own (x, y, spawnId) didn't need to change, only where it
// leads.
// enterFacing: every door in the game sits on a horizontal wall and is meant to be entered head-on.
// Without it, brushing along the wall sideways while the radius overlaps teleports you out of the
// room ("you can sometimes enter and exit areas by walking sideways").
// radius 12, not the original 6: at 6 the exit only fired from a ~9px window, which is under half
// Frankie's own body width. That tightness was a workaround for sideways teleporting, and
// enterFacing has done that job properly since -- so the radius only has to be findable.
export const BAKERY_DOOR: Door = { x: 255, y: 334, radius: 12, target: "Street", spawnId: "fromBakery", enterFacing: "south" };
// Directly north of the door and 40px clear of it, like every other arrival spawn in the game. It
// used to sit at x230 to clear a hiding spot ("the barrel") whose 32px radius overlapped it -- that
// spot no longer exists (see HIDING_SPOTS), and the leftover 25px offset meant the only way back
// out was to find a 9px window 25px to the east: walking straight back the way you came just
// pressed you into the wall, and sliding along it was swallowed by enterFacing.
export const BAKERY_SPAWN_FROM_STREET = { x: 255, y: 294 };

export const BAKERY_LOCKED_LINES: DialogueLine[] = [{ speaker: "Frankie", text: "Not without the flour. Birthday cakes don't bake themselves!" }];
