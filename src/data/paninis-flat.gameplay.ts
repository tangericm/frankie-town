import type { Door } from "../systems/SceneTransition";
import type { DialogueLine } from "../systems/DialogueSequencer";

export const PANINIS_DOOR: Door = { x: 304, y: 398, radius: 10, target: "Street", spawnId: "fromPaninis", enterFacing: "south", hideArrow: true };
export const PANINIS_SPAWN = { x: 304, y: 350 };
// Her loaf overlaps the cupboard's lower edge: she is guarding the door, not merely nearby.
export const PANINI_GUARD = { x: 268, y: 166 };
// Rest 1 is at the mouse (pn-MouseToy at 128,184, painted 129-151 / 191-201): her feet just
// south of its painted bottom, so the toy sits between her front paws while she bats it. It
// used to be (144,245) with the toy relocated to (132,230) for the visit, which both moved the
// mouse every time and buried it under her sprite. Rest 3 is the cushion centre of the top-down
// basket (pn-Basket at 384,328); her feet sit behind its separately drawn front rim.
export const PANINI_REST = [PANINI_GUARD, { x: 140, y: 203 }, { x: 424, y: 208 }, { x: 416, y: 366 }] as const;
// Centre ray passes through the painted cushion centre (424, 196.5).
export const PANINI_SUNBEAM = [[326, 128], [391, 128], [514, 232], [402, 232]] as const;
export const PANINIS_ZONES = {
	butter: { x: 268, y: 180, radius: 30, reachBounds: { x: 240, y: 137, width: 56, height: 43 }, indicatorOffset: 66, texture: "pn-ButterCupboard" },
	toy: { x: 140, y: 204, radius: 28, reachBounds: { x: 129, y: 191, width: 22, height: 10 }, indicatorOffset: 10, texture: "pn-MouseToy" },
	curtains: { x: 386, y: 153, radius: 32, reachBounds: { x: 312, y: 128, width: 96, height: 1 }, indicatorOffset: 70, texture: "pn-CurtainsClosed" },
	basket: { x: 416, y: 382, radius: 30, reachBounds: { x: 384, y: 350, width: 64, height: 42 }, indicatorOffset: 35, texture: "pn-Basket" },
} as const;
const t = (text: string): DialogueLine => ({ speaker: "Frankie", text, thought: true });
/** Panini speaks for herself now and then (she has a portrait of her own): cat noises only. */
const cat = (text: string): DialogueLine => ({ speaker: "Panini", text });
/** Where Frankie steps to while Panini visits a toy, so he is not standing in front of her. */
export const FRANKIE_ASIDE = {
	toy: { x: 256, y: 218, facing: "west" as const },
	basket: { x: 360, y: 356, facing: "east" as const },
} as const;
export const PANINIS_LINES = {
	guard: [t("Butter. Behind glass. Behind a cat."), cat("Mrrp."), t("She looks ready to play. Maybe the mouse and that basket will tire her out.")],
	meetFirst: [t("Better say hello to the cat first. She is watching me.")],
	toy: [t("One slightly chewed mouse. Still a very good mouse.")],
	curtains: [t("A little sunshine. Strictly for the cat. Obviously.")],
	basket: [t("An empty basket. A cat-sized invitation.")],
	notTired: [t("Sunshine looks promising. But she is much too interested in me for a nap. Mouse first? Or the basket?")],
	tryMouse: [t("The basket was a start. Let’s give that mouse a little wiggle before we try nap time.")],
	tryBasket: [t("The mouse was a hit. Perhaps she would like to inspect that basket before nap time.")],
	toyReturn: [cat("Mrow!"), t("A mighty hunter. Straight back to guarding the butter, though.")],
	basketReturn: [cat("Prrrp."), t("Inspected. Approved. Apparently the butter still needs supervising.")],
	toyAgain: [t("That mouse has had quite enough adventures. What else might she like?")],
	basketAgain: [t("The basket has passed inspection. Time for a different invitation.")],
	asleep: [cat("...mrrr."), t("There we go. A warm cushion after all that important cat business. Sleep well, Panini.")],
	settled: [t("Sound asleep in the sunshine. I’ll be very quiet about the butter.")],
	taken: [t("Butter for the cake. Thank you, Panini. Sleep well."), t("That is everything! Back to our apartment. Rafa and I have a birthday cake to bake.")],
	empty: [t("The butter is safely accounted for. The cat remains in charge.")],
};
