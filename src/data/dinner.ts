import type { GameState, GameFlag } from "../systems/GameState";
import type { DialogueLine } from "../systems/DialogueSequencer";
import type { SceneKey } from "./objectives";

export const DINNER_ASSIGNMENT: DialogueLine[] = [
	{ speaker: "Michell", text: "Lovely cake. Now... does anyone know where we're going for dinner?" },
	{ speaker: "Michell", text: "The pigeon by the café knows, apparently. Rafa says he wants three things for his collection. Very particular bird." },
	{ speaker: "Michell", text: "He keeps leaving little treasures around the neighbourhood. Maybe take a wander and see what catches your nose?" },
	{ speaker: "Michell", text: "Go and see what he's up to, Frankie. I'll save you a bit of cake. A small bit. It is my birthday." },
];
/** Keepsakes are scattered across the neighbourhood, available only after the dinner errand. */
export const DINNER_CLUES: { id: string; flag: GameFlag; scene: SceneKey; label: string; texture: string; width: number; x: number; y: number; depth: number; radius?: number; stand: { x: number; y: number }; text: string; memory: string }[] = [
	{ id: "azumarill", flag: "dinnerPlush", scene: "Bakery", label: "Blue plush", texture: "dinner-azumarill", width: 28, x: 208, y: 244, depth: 244, stand: { x: 208, y: 268 }, text: "Azumarill! Teddy's been looking after you. Come on, we've got a pigeon to see.", memory: "There's a little slip on your tag: 'Teddy's baking ingredient. The birthday bake.' I'll keep that." },
	{ id: "bowls", flag: "dinnerBowls", scene: "PaninisFlat", label: "Tea cups", texture: "dinner-bowls", width: 32, x: 268, y: 116, depth: 156, radius: 46, stand: { x: 268, y: 166 }, text: "Two tea cups, packed for our very fancy pigeon. I hope he's doing the washing up.", memory: "Their card says: 'A yellow ingredient. A sleepy cat. One of these porcelain cups.' Our pigeon has been taking notes." },
	{ id: "skyline", flag: "dinnerSkyline", scene: "Street", label: "Tiny bridge", texture: "dinner-skyline", width: 44, x: 618, y: 326, depth: 344, radius: 56, stand: { x: 618, y: 326 }, text: "A little bridge on the bench. Much easier to carry than the real one.", memory: "A paper slip underneath: 'Pierre's birds. Something sweet.' Another one for the pigeon." },
];
export function dinnerCluesFound(state: GameState): number {
	return DINNER_CLUES.filter(clue => state.flag(clue.flag)).length;
}
/** Clear pavement inside the existing pigeon plaza, away from doors and café furniture. */
export const DINNER_DELIVERY = { x: 300, y: 680, fromX: 230, toX: 350, noteWidth: 18 };
export const DINNER_DESTINATION = "Ichika";

export function dinnerReminder(state: GameState, speaker: "Michell" | "Rafa"): DialogueLine[] {
	return [{ speaker, text: dinnerCluesFound(state) < DINNER_CLUES.length
		? "No rush. Have a sniff around, say hello to your friends. Our pigeon likes things that look a little out of place."
		: "That's all three! Head to the outdoor café tables on the Street, just west of the apartment. Our pigeon will meet you there." }];
}
