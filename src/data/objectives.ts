import type { GameState } from "../systems/GameState";
import { dinnerCluesFound, DINNER_CLUES } from "./dinner";
import { QUEST } from "./quest";
import { HEN_IDS, SUGAR_CUBES } from "./market.gameplay";

export type SceneKey = "Apartment" | "Bakery" | "Street" | "Market" | "PaninisFlat";

export interface Objective {
	/** One short line for the HUD: where to go or what to do next, from where the player is. */
	text: string;
	/** The scene key a door in the current scene leads to if that door is the way forward -- lets
	 * SceneTransition light up the right exit. Omitted when the next step is inside this scene. */
	doorTarget?: SceneKey;
}

/**
 * The single current objective, phrased for the scene the player is standing in.
 *
 * Pure: reads GameState, returns text. This exists because on a phone the journal collapses to a
 * tab, so after Rafa's one line the screen held nothing that remembered the goal; the desktop
 * checklist has the same gap between "Flour ☐" and knowing which door to take. One line, always
 * visible, that answers "where now?" -- and it never says more than the dialogue already has.
 *
 * Returns null during the opening cutscene (nothing to do yet) and after the ending (nothing
 * left), so the HUD can hide rather than show a stale line.
 */
export function currentObjective(state: GameState, sceneKey: SceneKey): Objective | null {
	const flour = state.hasIngredient(QUEST.flourIngredientId);
	const eggs = state.hasIngredient(QUEST.eggsIngredientId);
	const sugar = state.hasIngredient(QUEST.sugarIngredientId);
	const marketDone = eggs && sugar;

	if (!state.hasSeenIntro()) return null;
	if (state.flag("cakeGiven")) {
		if (state.flag("dinnerRevealed")) return null;
		if (!state.flag("dinnerStarted")) return sceneKey === "Apartment" ? { text: "Ask Michell about dinner" } : { text: "Home, to Michell", doorTarget: sceneKey === "Street" ? "Apartment" : "Street" };
		if (dinnerCluesFound(state) === DINNER_CLUES.length) return sceneKey === "Street" ? { text: state.flag("dinnerNoteDropped") ? "Pick up the note at the outdoor café tables" : "Meet the pigeon at the outdoor café tables, west of home" } : { text: "Back to the Street: outdoor café tables", doorTarget: "Street" };
		return { text: `Explore for little treasures · ${dinnerCluesFound(state)}/${DINNER_CLUES.length}` };
	}

	if (state.flag("bakeDone") || flour && marketDone && state.hasIngredient(QUEST.butterIngredientId)) {
		// Everything's in hand: home, and tell Rafa.
		switch (sceneKey) {
			case "Apartment": return { text: "Tell Rafa" };
			case "Street": return { text: "Home, to Rafa", doorTarget: "Apartment" };
			default: return { text: "Back to the street", doorTarget: "Street" };
		}
	}

	if (sceneKey === "PaninisFlat") {
		if (!state.hasIngredient(QUEST.butterIngredientId)) {
			if (state.flag("paniniMoved")) return { text: "Take the butter from the cupboard" };
			if (!state.flag("paniniMet")) return { text: "Say hello to Panini" };
			if (!state.flag("paniniToyTried") && !state.flag("paniniBasketTried")) return { text: "Play with Panini: mouse and basket" };
			if (!state.flag("paniniToyTried")) return { text: "Try Panini’s toy mouse" };
			if (!state.flag("paniniBasketTried")) return { text: "Let Panini inspect the basket" };
			return { text: "Open the curtains for Panini’s nap" };
		}
		return { text: "Back to the street", doorTarget: "Street" };
	}
	if (flour && marketDone) {
		if (sceneKey === "Street") return { text: "Butter: Panini's flat, up the stairs", doorTarget: "PaninisFlat" };
		return { text: "Butter: Panini's flat", doorTarget: "Street" };
	}

	if (!flour) {
		switch (sceneKey) {
			case "Apartment": return { text: "Teddy's Bakery, south door", doorTarget: "Street" };
			case "Street": return { text: "Teddy's Bakery", doorTarget: "Bakery" };
			case "Bakery": {
				if (!state.hasStartedErrand()) return { text: "Talk to Teddy" };
				const found = state.bakeryItemsCollectedCount();
				const total = QUEST.bakeryItemIds.length;
				return found >= total ? { text: "Back to Teddy" } : { text: `Find Teddy's supplies, ${found}/${total}` };
			}
			case "Market": return { text: "Teddy's Bakery, back through the arch", doorTarget: "Street" };
		}
	}

	// Flour done, market not.
	switch (sceneKey) {
		case "Apartment": return { text: "Pierre's market, south door", doorTarget: "Street" };
		case "Street": return { text: "Pierre's market, through the arch", doorTarget: "Market" };
		case "Bakery": return { text: "Pierre's market, back to the street", doorTarget: "Street" };
		case "Market": {
			if (!state.hasMetPierre()) return { text: "Talk to Pierre" };
			const parts: string[] = [];
			if (!eggs) {
				const hens = state.marketHensHomedCount();
				parts.push(hens >= HEN_IDS.length ? "Eggs: see Pierre" : `Eggs: hen coop (${hens}/${HEN_IDS.length} hens)`);
			}
			if (!sugar) parts.push(`Sugar: market games (${state.marketSugarCubeCount()}/${SUGAR_CUBES.length})`);
			return { text: parts.join("\n") };
		}
	}
}
