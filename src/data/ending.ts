import type { DialogueLine } from "../systems/DialogueSequencer";

/**
 * The ending, in the apartment: everything after Rafa's "You got it! Every last thing."
 *
 * Beat sheet (docs/design/opening-and-cake-quest.md, beats 6-7): a short bake with one
 * button-timing moment so it isn't purely passive, the cake appears, Michell comes over, her
 * reaction is the ending, then a quiet credits beat over the room. No score screen. Afterwards the
 * game keeps going: Michell stays by the table, the cake stays, every room stays open.
 */

/** Rafa, straight after the ending exchange, sending Frankie to the kitchen. */
export const BAKE_INTRO_LINES: DialogueLine[] = [
	{ speaker: "Rafa", text: "Right. Kitchen. I'll keep her busy. You bake." },
	{ speaker: "Frankie", text: "...Arf?" },
	{ speaker: "Rafa", text: "Paws, Frankie. You have paws. Mix, pour, bake. How hard can it be." },
];

/** Labels for the three timing-bar rounds, in order. */
export const BAKE_STEPS = ["Mix", "Pour", "Bake"];

/** Where Frankie stands to bake: the floor just west of the stove, facing it. */
export const BAKE_SPOT = { x: 338, y: 262, facing: "east" as const };

/** Frankie's verdict on his own cake, by how many of the three beats landed. */
export const BAKE_RESULT_LINES: Record<0 | 1 | 2 | 3, DialogueLine[]> = {
	3: [{ speaker: "Frankie", text: "It rose! It smells good! I made Michell a birthday cake. With paws.", thought: true }],
	2: [{ speaker: "Frankie", text: "It leans. Cakes are allowed to lean. It is called character.", thought: true }],
	1: [{ speaker: "Frankie", text: "Structurally optimistic. Emotionally, a triumph.", thought: true }],
	0: [{ speaker: "Frankie", text: "It is cake-adjacent. She will understand. She always understands.", thought: true }],
};

/** The cake goes on the coffee table (o_ccc5aab9, drawn from y 265 at depth 328): `depth` beats
 * the table's own so it sits on the top rather than under it. */
export const CAKE_SPOT = { x: 214, y: 291, depth: 330, scale: 0.45 };

/** From the window, turn west into the aisle, then south to the table. */
export const MICHELL_WALK = [
	{ x: 310, y: 214, facing: "west" as const },
	{ x: 310, y: 318, facing: "south" as const },
	{ x: 296, y: 318, facing: "west" as const },
];
/** Where she stays after the celebration: east of the table, facing the player. */
export const MICHELL_AT_TABLE = { x: 296, y: 318, facing: "south" as const };
/** Where Frankie goes to meet her: down from the stove to her side, facing her. He used to stay
 * at the stove while she thanked him from the table, thirty pixels of kitchen apart. */
export const FRANKIE_MEET_SPOT = { x: 326, y: 330, facing: "west" as const };

/** Her reaction. She never hears the animals' English, so no gag here -- just her and him. */
export const MICHELL_REACTION_LINES: DialogueLine[] = [
	{ speaker: "Michell", text: "Frankie? What's all the... oh." },
	{ speaker: "Michell", text: "Oh, Stinky." },
	{ speaker: "Frankie", text: "Arf." },
	{ speaker: "Michell", text: "Is that... did you... there's flour on your ears." },
	{ speaker: "Michell", text: "You made all this for me? You lovely little dog." },
	{ speaker: "Frankie", text: "Arf arf!" },
	{ speaker: "Michell", text: "Best birthday. Best dog. Come here." },
];
/** One extra line when the Street window box bloomed before the cake was made. */
export const MICHELL_FLOWER_LINE: DialogueLine = { speaker: "Michell", text: "And is that my window flower on top? Frankie. FRANKIE." };

/** After the credits, talking to Michell by the table. */
export const MICHELL_AFTER_LINES: DialogueLine[][] = [
	[{ speaker: "Michell", text: "Thank you for my cake, Frankie. Best birthday surprise ever." }, { speaker: "Michell", text: "Rafa's had three slices. Don't tell him I counted." }],
	[{ speaker: "Michell", text: "Cake first, then that walk I promised. Birthday rules." }],
	[{ speaker: "Michell", text: "Go on, go see your friends. I'm not going anywhere." }],
];

/** Once every prop thought in the neighbourhood has been found (the notebook is full). */
export const MICHELL_NOTEBOOK_LINES: DialogueLine[] = [
	{ speaker: "Michell", text: "I think you've sniffed every chair between here and the market." },
	{ speaker: "Michell", text: "Good. Someone should know this place properly. Come here, you." },
];

/** Rafa, after it's all done. Said on the street: the day after, he's out at the cafe. */
export const RAFA_AFTER_LINES: DialogueLine[] = [
	{ speaker: "Rafa", text: "She cried a bit. The good kind. Nice work, Frankie." },
	{ speaker: "Rafa", text: "I'm giving you two some room. Also the cafe does a sausage roll." },
];
/** After the cake: broad central pavement, clear of the café courier and apartment entrance. */
export const RAFA_STREET_POSITION = { x: 500, y: 760, facing: "east" as const };

/** Quiet credits over the room. Each entry fades in, holds, fades out. */
export const CREDITS: string[] = [
	"Frankie's Adventure",
	"for Michell",
	"Frankie, Rafa, Teddy, Pierre, Panini, and the hens\nplayed by themselves",
	"Thank you for playing.\nThe neighbourhood is still open.",
];
