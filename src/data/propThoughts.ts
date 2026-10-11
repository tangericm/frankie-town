import type { DialogueLine } from "../systems/DialogueSequencer";
import type { SceneKey } from "./objectives";
import type { Rect } from "../systems/pathfinding";

/**
 * Optional one-line "Frankie thoughts" on the furniture -- the environmental-storytelling pass the
 * 2026-08-25 brief asked for (item 3) and the audit found still missing. Every entry is optional,
 * under two lines, and about Michell or Frankie specifically; none gates anything.
 *
 * `first` plays the first time, `again` (if present) every time after, so a prop can land a joke
 * once and then settle into a shorter beat. Positions are where Frankie *stands* (his feet), not
 * the prop's own art centre -- see bakery.gameplay's HIDING_SPOTS for why that distinction is the
 * whole difference between a zone you can reach and one you can't. `textureKey` is the prop's own
 * image, so a tap on it works on touch; `indicatorOffset` puts the badge over the prop, not over
 * the patch of floor in front of it.
 */
export interface PropThought {
	id: string;
	x: number;
	y: number;
	radius: number;
	reachBounds?: Rect;
	indicatorOffset: number;
	textureKey?: string;
	/** Region within a shared scenery image, in source pixels. */
	visualCrop?: { x: number; y: number; width: number; height: number };
	first: DialogueLine[];
	firstReaction?: "heart" | "?";
	afterCake?: DialogueLine[];
	again?: DialogueLine[];
}

const t = (text: string): DialogueLine => ({ speaker: "Frankie", text, thought: true });

export const PROP_THOUGHTS: Record<SceneKey, PropThought[]> = {
	PaninisFlat: [],
	Apartment: [
		{
			// Michell's bed, in the bedroom nook (x64-192 / y320-448; the bed's own collider is
			// x87-187 / y425-440). The zone sits on that collider's top edge, in the middle of the
			// bed towards its foot end (clear of the dresser thought's own radius), so it is only in
			// range from the nook's own floor north of the bed. It used to be at (205,440): on the
			// 16px wall east of the nook, where the hallway on the wall's far side was just as close
			// as the bedroom, and Frankie could admire the bed through the wall. Frankie sleeps in
			// his own dog bed by the desk, not in hers.
			id: "bed", x: 168, y: 430, radius: 26, indicatorOffset: 44, textureKey: "o_55fc82f4",
			reachBounds: { x: 87, y: 425, width: 100, height: 15 },
			first: [t("Michell's bed. Not for dogs, apparently. I have my own, by her desk."), t("I check under it every night for intruders. Never found one. Very thorough.")],
			again: [t("Still no intruders. Excellent work, Frankie.")],
		},
		{
			id: "dresser", x: 130, y: 374, radius: 36, indicatorOffset: 70, textureKey: "o_c24ac8e5",
			firstReaction: "heart",
			reachBounds: { x: 90, y: 328, width: 80, height: 24 },
			first: [t("The photo on the dresser. Michell, a beach, a much smaller me."), t("I love the beach. All that sand, and every single bit needs sniffing.")],
			again: [t("Michell says she has nothing to wear. It takes up several drawers.")],
		},
		{
			id: "sofa", x: 300, y: 252, radius: 38, indicatorOffset: 36, textureKey: "o_76baba91",
			reachBounds: { x: 193, y: 204, width: 98, height: 72 },
			first: [t("The sofa. My favourite place to sit with Michell."), t("The middle cushion is mine. We have an understanding.")],
			again: [t("Middle cushion. Mine.")],
		},
		{
			id: "fridge", x: 338, y: 392, radius: 34, indicatorOffset: 56, textureKey: "o_8c94ef42",
			firstReaction: "?",
			reachBounds: { x: 358, y: 328, width: 42, height: 83 },
			first: [t("Wilmo lives in here. Michell feeds him flour and calls him her sourdough starter."), t("A pet in a jar. No walks. No tricks. Still gets fed. Interesting.")],
			again: [t("Wilmo and the avocados. Her other dependants.")],
		},
		{
			// The stove faces west; its interaction sits at the oven door.
			id: "apartment-oven", x: 366, y: 252, radius: 26, indicatorOffset: 60, textureKey: "o_c16efb33",
			reachBounds: { x: 363, y: 224, width: 37, height: 55 },
			first: [t("The oven. Michell puts dough in, and the whole flat starts smelling wonderful."), t("I supervise from a safe distance. Very closely.")],
			again: [t("Still on oven supervision duty.")],
		},
	],
	Bakery: [
		{
			id: "display-case", x: 396, y: 218, radius: 40, indicatorOffset: 150, textureKey: "bkry-e9a74400",
			reachBounds: { x: 357, y: 149, width: 62, height: 43 },
			first: [t("The glass case. Michell goes for the almond croissant. Or the matcha one. With a coffee."), t("Teddy pretends to charge her for it.")],
			again: [t("Almond croissant. Hers.")],
		},
		{
			id: "oven", x: 185, y: 216, radius: 28, indicatorOffset: 110, textureKey: "bkry-3a8a34e1",
			// Viewed across the serving-counter strip; the floor beside the oven is isolated.
			reachBounds: { x: 124, y: 171, width: 105, height: 21 },
			first: [t("The oven. It smells like the whole street on a Sunday."), t("Teddy says a cake is mostly patience. I have very little. I will borrow some.")],
			again: [t("Sunday smell.")],
		},
		{
			// The big wicker basket is one of the errand's hiding spots, so no thought lives there;
			// the fern by the left window is the one bit of floor with nothing else on it.
			id: "fern", x: 96, y: 320, radius: 38, indicatorOffset: 44, textureKey: "bkry-3feb192d",
			reachBounds: { x: 91, y: 306, width: 31, height: 21 },
			first: [t("Teddy says this fern needs watering. I offered to lift a leg."), t("He brought out a watering can. Apparently we meant different things.")],
			again: [t("Watering can only. Teddy was very clear.")],
		},
	],
	Street: [
		{
			id: "pond", x: 640, y: 500, radius: 46, indicatorOffset: 30, textureKey: "str-pl-base",
			visualCrop: { x: 556, y: 366, width: 120, height: 104 },
			reachBounds: { x: 556, y: 366, width: 120, height: 104 },
			first: [t("The pond. The stork has been standing there since I was a puppy."), t("Michell says it is thinking. I say it is waiting for bread.")],
			again: [t("Still thinking. Still no bread.")],
		},
		{
			id: "cafe", x: 380, y: 680, radius: 40, indicatorOffset: 60, textureKey: "str-cbd68e60",
			reachBounds: { x: 356, y: 645, width: 40, height: 21 },
			first: [t("Michell's table. The one by the noticeboard, always."), t("The waiter brings a bowl of water without being asked. Good waiter.")],
			again: [t("The one by the noticeboard.")],
		},
		{
			id: "noticeboard", x: 304, y: 640, radius: 40, indicatorOffset: 64, textureKey: "str-a777aaa0",
			reachBounds: { x: 285, y: 604, width: 38, height: 21 },
			first: [t("The noticeboard. Piano lessons. A lost umbrella. And a photo of Sushi: 'NOT lost. Please stop feeding her.'"), t("Sushi. The outdoor cat from round the corner. We met. She was not impressed. Nothing about a birthday, though. Still a secret.")],
			again: [t("Sushi is still not lost. The birthday is still a secret.")],
			afterCake: [t("Sushi is still not lost. Birthday mission: accomplished. She remains unimpressed.")],
		},
		{
			// The bicycle (str-2010d6e9, 865,545) sits on the lawn itself, which is one solid
			// collider (Street.COLLIDERS' [848, 544, 192, 160]) -- Frankie views it from the open
			// path just north of the lawn, not from beside it.
			id: "bicycle", x: 860, y: 530, radius: 34, indicatorOffset: 40, textureKey: "str-2010d6e9",
			reachBounds: { x: 867, y: 569, width: 45, height: 21 },
			first: [t("Michell's bike, left on the lawn again. She keeps meaning to move it."), t("I have chewed exactly one bicycle tire in my life. It was this one. We don't discuss it.")],
			again: [t("Still on the lawn. Some things are permanent.")],
		},
		{
			// The log (str-e4beaae7, 857,669) also sits on the lawn, near its south edge -- viewed
			// from the open path just south of it.
			id: "log", x: 873, y: 718, radius: 28, indicatorOffset: 30, textureKey: "str-e4beaae7",
			reachBounds: { x: 858, y: 682, width: 30, height: 14 },
			first: [t("A log, by the lawn. Perfect for sniffing. Terrible for fetching, though I have tried."), t("Something lived under it once. I am almost certain. I will keep checking.")],
			again: [t("Still checking under the log. Michell calls it diligence.")],
		},
	],
	Market: [
		{
			// Beside the actual coop in the yard, not the pots at the gate 140px south.
			id: "coop", x: 136, y: 674, radius: 36, indicatorOffset: 40, textureKey: "mkt-50bba3ae",
			visualCrop: { x: 24, y: 8, width: 77, height: 112 },
			reachBounds: { x: 42, y: 620, width: 79, height: 43 },
			first: [t("The coop. The hens have opinions about me and they are not kind ones."), t("Fair.")],
			again: [t("Opinions. Unkind. Fair.")],
		},
		{
			// The produce basket is beside the main aisle, before Pierre's stall.
			id: "crates", x: 389, y: 640, radius: 38, indicatorOffset: 36, textureKey: "mkt-7a2ebce1",
			reachBounds: { x: 412, y: 604, width: 110, height: 42 },
			first: [t("A basket of market produce. Michell would call this a quick shop."), t("A quick shop usually ends with four bags and something she wasn't looking for.")],
			again: [t("Only looking. That is how it starts.")],
		},
	],
};
