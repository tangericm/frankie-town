import { DialogueLine } from "../systems/DialogueSequencer";
import { Door } from "../systems/SceneTransition";
import { NpcColliderSpec } from "../systems/npcCollider";
import type { GameState } from "../systems/GameState";

// Frankie's own default apartment spawn is (312, 368). Rafa's resting spot sits at the same y, a
// 46px gap to his left (up from an original 28px, which had him arriving almost nose-to-nose) --
// a comfortable conversational distance instead. The walk-in still starts at the door (see
// RAFA_WALK_IN_START/APARTMENT_DOOR below, same x), so reaching this narrower resting x makes the
// approach a slight diagonal rather than a pure vertical line -- reads as walking *toward*
// Frankie rather than sliding along a fixed track, which if anything looks more natural.
export const RAFA_POSITION = { x: 266, y: 368 };
// Where Rafa's opening-scene entrance starts -- at the door (see APARTMENT_DOOR below).
export const RAFA_WALK_IN_START = { x: 284, y: 560 };
// Same 28x14 foot box as Frankie's own body (see body.setSize in Apartment.ts) --
// bottom-anchored at RAFA_POSITION, the same constant his talk-proximity zone already uses.
export const RAFA_COLLIDER: NpcColliderSpec = { id: "rafa", x: RAFA_POSITION.x, y: RAFA_POSITION.y, width: 28, height: 14 };

// First visit only: Frankie starts the opening curled up in his dog bed (o_90437f2e, the round
// "dog-bed" cohesion prop placed at (275, 153), 40x24, drawn at depth 177) instead of asleep in the
// open floor at his default spawn (312, 368). This is a *drawing* position, not a physics one: the
// sleeping sprite's foot anchor (FRANKIE_ORIGIN sleeping-south, 0.8958 of a 48px frame, body
// centre ~21px above it) is placed so the curled body sits centred on the bed's own centre
// (295, 165), and the sprite is drawn just above the bed (depth 178). The previous (295, 162)
// put his foot box in the 22px pocket between the north wall (y144) and the bed/shelf collider
// strip (y166-179) -- a sealed pocket the flood-fill had already flagged -- and drawn *behind* the
// bed, so the game opened with Frankie stuck. On waking he steps down to FRANKIE_WAKE_SPOT.
export const FRANKIE_DOG_BED_SPAWN = { x: 295, y: 186 };
// Where he lands when he gets up: the corridor floor south-east of the bed. His 28x14 foot box
// (x296-324, y196-210) clears the bed/shelf strip (y166-179), the sofa blocker (x193-291, from
// y204: at x300 his left edge overlapped it and he could not walk south), the desk (x201-260)
// and Rafa's own collider at RAFA_OPENING_POSITION (x319-347, y181-195). Inside Michell's zone.
export const FRANKIE_WAKE_SPOT = { x: 310, y: 210 };
// Rafa's opening-scene walk-in still starts at the door (RAFA_WALK_IN_START, above) but now ends
// beside the dog bed instead of at RAFA_POSITION (the room's open middle, where Frankie no longer
// sleeps) -- a comfortable ~50px conversational distance from FRANKIE_DOG_BED_SPAWN, clear of both
// the desk collider (201-260, 168-200) and the bed/shelf strip above. Only used while firstVisit is
// true; every later visit still places Rafa at plain RAFA_POSITION, per the walk-in code.
// (346, 216), not the earlier (333, 195): at y195 his 39px sprite overlapped the crate and
// mini-fridge behind the bed and he read as standing on them. Feet at 216 put him a clear body
// below that shelf strip (y166-179), his 28x14 collider (x332-360, y202-216) clear of Frankie's
// wake spot (x296-324) and of the counter (from y220).
export const RAFA_OPENING_POSITION = { x: 346, y: 216 };

// A groggy back-and-forth before the reveal -- Frankie's plain barks read as confusion (he just
// woke up), Rafa's build in urgency, then ONE noise->bumper->translation cycle pays it off (not
// one per line -- the gag is a one-time joke, repeating it back to back reads as a stutter, not a
// callback).
export const OPENING_DIALOGUE: DialogueLine[] = [
	{ speaker: "Frankie", text: "...Arf?" },
	{ speaker: "Rafa", text: "Woof! Woof-woof!" },
	{ speaker: "Frankie", text: "Arf? Arrf-arf?" },
	{ speaker: "Rafa", text: "Awrf! Rrf-rrf-awrf!" },
	{ speaker: "Frankie", text: "...Arf." },
	{
		speaker: "Rafa",
		noise: "Rrf! Awrf-awrf- awrf! Rrf-rrf! Awrf!",
		bumper: "Translation brought to you by BarkBox AI.",
		english:
			"Frankie! Michell has no idea what we're planning for her birthday. Teddy's holding the cake supplies. Go be the good son. I'll be the distraction. Head out the south door!",
	},
];

// Talking to Rafa again after the opening scene shouldn't replay the whole bark exchange and
// gag -- just the actual instruction, as a reminder.
export const RAFA_REMINDER_LINES: DialogueLine[] = [{ speaker: "Rafa", text: "Teddy's at the bakery, Frankie. Head outside and go see him. I'll keep Michell company." }];

// The middle of the errand: flour in hand, eggs and sugar still out there. Without this branch
// Rafa has nothing to say between the bakery and the market -- he either repeats "go see Teddy"
// (already done) or, worse, plays the ending (see attachGameplay's rafa zone).
export const RAFA_MARKET_REMINDER_LINES: DialogueLine[] = [
	{ speaker: "Rafa", text: "Flour! Nice one, Frankie. Pierre can help with eggs and sugar at the market. We'll have this cake sorted in no time." },
];

// Translation is established once in the opening; later conversations are plain dialogue.
export const ENDING_DIALOGUE: DialogueLine[] = [
	{ speaker: "Rafa", text: "You got it! Every last thing. She is going to love this cake, Frankie. Best birthday she's ever had, and it's all down to you." },
];
export const ENDING_REMINDER_LINES: DialogueLine[] = [{ speaker: "Rafa", text: "Best birthday ever, and it's not even lunchtime. Good dog." }];

// Michell works at the computer desk in the room's north-west corner (her painted pixels are world
// x196-263 / y122-199; the desk's own collider is x201-260 / y168-200). The sofa (o_76baba91,
// x193-291 / y204-276) sits directly south of that desk, so there is no approach from the room's
// middle at all -- the only floor Frankie can stand on next to her is east of the desk, reached by
// walking up the room's east corridor: free space starts at x278 on the y194 row.
//
// The zone therefore sits just east of the desk, 6px from that spot and inside a 44px radius from
// most of the corridor mouth, so the badge appears as he comes up it. Putting the zone on Michell
// herself (the first attempt) or on the sofa's front face (the second) both failed for the same
// reason in opposite directions: the first was 90px from any standable floor, and the second could
// only be reached by talking to her across a solid sofa.
export const MICHELL_POSITION = { x: 272, y: 196 };
export const MICHELL_INTERACT_RADIUS = 44;
// Measured from the badge's own pointing tip: 61 puts it at y135, over Michell's head and
// shoulders -- the same "just above the character" placement Rafa's own 44 gives him.
export const MICHELL_BADGE_OFFSET = 61;
// The sofa's whole painted footprint, measured off o_76baba91's placement (193,204) and size
// (98x72). Its generated collider is only the base strip (y258-276) -- correct for something you
// walk behind, wrong for a sofa, which Frankie could otherwise round the side of and stand in the
// middle of, drawn underneath it ("Frankie actually phases underneath her desk").
export const APARTMENT_SOFA_BLOCKER = { x: 193, y: 204, width: 98, height: 72 } as const;
// She's not in on the surprise (see OPENING_DIALOGUE) and Frankie has no way to actually talk to
// her -- no Rafa around to translate his barks into English here -- so this stays warm flavor, not
// plot: not once does it reference the cake or the errand.
export const MICHELL_LINES: DialogueLine[] = [
	{ speaker: "Frankie", text: "Arf! Arf arf!" },
	{ speaker: "Michell", text: "Well hello, sunshine. Look at that tail go." },
	{ speaker: "Michell", text: "It's my birthday today, you know. Quiet one so far, but I've got good company." },
	{ speaker: "Michell", text: "We'll go for a walk soon, Stinky. Let me finish this first. Go on, go find Rafa." },
];

// She notices. Not the cake (still a secret) -- him: what he smells of, where he's been, that he
// keeps coming back to check on her. Keyed to what he's carrying, so every return home gets a
// different line, and the room registers the errand without a single word about it.
export const MICHELL_LINES_WITH_FLOUR: DialogueLine[] = [
	{ speaker: "Frankie", text: "Arf!" },
	{ speaker: "Michell", text: "Why do you smell like Teddy's? Have you been begging at the bakery again?" },
	{ speaker: "Michell", text: "There's flour on your nose. Come here. No, stay there, I'm working." },
];
export const MICHELL_LINES_WITH_EGGS_OR_SUGAR: DialogueLine[] = [
	{ speaker: "Frankie", text: "Arf arf." },
	{ speaker: "Michell", text: "Is that straw? Frankie, were you in Pierre's yard? He'll have my head." },
	{ speaker: "Michell", text: "Busy day for a small dog. Busier than mine, honestly." },
];
// After the market she has left the desk for the window -- stretching her legs, watching the
// street, and (though she'd never say it) wondering where he keeps going.
export const MICHELL_LINES_AT_WINDOW: DialogueLine[] = [
	{ speaker: "Michell", text: "There you are. I keep looking up and you're gone again." },
	{ speaker: "Michell", text: "Rafa's been in and out all day too. You two are up to something." },
	{ speaker: "Michell", text: "Don't tell me. I like a surprise. Even a small one." },
];
// Second and later chats at the window, rotating.
export const MICHELL_WINDOW_REPEATS: DialogueLine[][] = [
	[{ speaker: "Michell", text: "The stork's still at the pond. Some things don't change. Good." }],
	[{ speaker: "Michell", text: "Quiet birthday. I said that already, didn't I. It's a nice quiet." }],
	[{ speaker: "Michell", text: "Go on. Whatever it is, go finish it. I'll be here." }],
];

/** Picks Michell's lines for a visit, from what Frankie has done so far. */
export function michellLines(state: GameState): DialogueLine[] {
	const flour = state.hasIngredient("flour");
	const eggs = state.hasIngredient("eggs");
	const sugar = state.hasIngredient("sugar");
	if (eggs && sugar) {
		const chats = state.count("michellChats");
		return chats === 0 ? MICHELL_LINES_AT_WINDOW : MICHELL_WINDOW_REPEATS[(chats - 1) % MICHELL_WINDOW_REPEATS.length];
	}
	if (eggs || sugar) return MICHELL_LINES_WITH_EGGS_OR_SUGAR;
	if (flour) return MICHELL_LINES_WITH_FLOUR;
	return state.flag("michellGreeted")
		? [{ speaker: "Michell", text: "I know that look. Walk soon, I promise. You can supervise until then." }]
		: MICHELL_LINES;
}

/** Michell stands on clear floor in front of the crate by the window, facing north.
 * Her moving foot collider and interaction zone both follow this position. */
export const MICHELL_WINDOW_POSITION = { x: 328, y: 214, facing: "north" as const };
export const MICHELL_WINDOW_ZONE = { x: 328, y: 214, radius: 44, indicatorOffset: 64 };

// What comes home shows up at home (the "hub fills up" effect, audit item 7): each ingredient gets
// a spot in the apartment once Frankie has it. Positions are the prop's bottom-centre; depth is
// above their supporting furniture. All four go into the cake.
/** `depth` is explicit because two of these sit ON furniture: the generated scene draws the counter
 * (o_50e6d2e6) at depth 266 and the coffee table (o_ccc5aab9) at 328, so a prop sorted by its own
 * y would vanish under the table top it is meant to be standing on. */
export const INGREDIENT_PROPS: { ingredient: string; texture: string; x: number; y: number; scale: number; depth: number }[] = [
	{ ingredient: "butter", texture: "icon-butter", x: 382, y: 269, scale: 0.5, depth: 366 },
	{ ingredient: "flour", texture: "icon-flour", x: 375, y: 316, scale: 0.5, depth: 366 }, // lower counter beside the sink; above the counter sprite in draw order
	{ ingredient: "eggs", texture: "bkry-icon-eggs-basket", x: 214, y: 292, scale: 0.75, depth: 330 }, // coffee table, west end
	{ ingredient: "sugar", texture: "bkry-icon-sugar-sack", x: 391, y: 316, scale: 0.45, depth: 366 }, // beside the flour on the lower kitchen counter
];

// The door is a wall-mounted sprite, not a walkable gap -- the floor itself ends at y=576 (a
// wall collider runs the full room width from there down) and the door graphic sits on the wall
// beyond it, purely decorative. Verified with scripts/preview-pixellab-scene.py apartment: the
// door art is centered at x=284, not x=224 (that was centered on empty wall well to its left,
// which is why the trigger previously only fired from well left of the actual door). Centered
// right at the wall boundary with a small radius so it only fires once Frankie is actually
// pressed against the wall above the door, not just generally nearby.
// Target changed from Bakery to Street when Street became the hub between
// Apartment and Bakery -- this door's own (x, y, spawnId) didn't need to change, only where it
// leads.
// enterFacing: every door in the game sits on a horizontal wall and is meant to be entered head-on.
// Without it, brushing along the wall sideways while the radius overlaps teleports you out of the
// room ("you can sometimes enter and exit areas by walking sideways").
export const APARTMENT_DOOR: Door = { x: 284, y: 578, radius: 8, target: "Street", spawnId: "fromApartment", enterFacing: "south" };
// 40px clear of the door (see STREET_SPAWN_FROM_BAKERY for why): at the old 23px, walking
// forward out of the doorway was already back inside its trigger.
export const APARTMENT_SPAWN_FROM_STREET = { x: 284, y: 538 };
