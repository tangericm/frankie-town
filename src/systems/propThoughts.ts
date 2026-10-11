import Phaser from "phaser";
import type { GameState } from "./GameState";
import type { DialogueBox } from "./DialogueBox";
import type { InteractionManager } from "./InteractionManager";
import { PROP_THOUGHTS } from "../data/propThoughts";
import type { SceneKey } from "../data/objectives";

/** The already-placed image for a prop, found by texture key -- the generated scenes add every
 * object as `this.add.image(x, y, key)`, so the key is the only stable handle. Null if the scene
 * has no such image (a typo in the data, or a prop the export no longer has), in which case the
 * zone still works from the keyboard; it just has nothing to tap on touch. */
export function findImageByTexture(scene: Phaser.Scene, key: string): Phaser.GameObjects.Image | null {
	for (const child of scene.children.list) {
		if (child instanceof Phaser.GameObjects.Image && child.texture?.key === key) return child;
	}
	return null;
}

/** Registers every prop thought for a scene as an interaction zone. */
export function registerPropThoughts(
	scene: Phaser.Scene,
	sceneKey: SceneKey,
	interactions: InteractionManager,
	dialogueBox: DialogueBox,
	gameState: GameState,
	pauseDuring: (play: () => void) => void,
	dialogueDone: () => void,
	onFirstReaction?: (kind: "heart" | "?") => void,
) {
	for (const prop of PROP_THOUGHTS[sceneKey] ?? []) {
		let visual = prop.textureKey ? findImageByTexture(scene, prop.textureKey) : null;
		if (visual && prop.visualCrop) {
			// A pond can be baked into the floor and a display into a whole stall column.
			// Reuse just its authored region so selection doesn't tint the entire map.
			const { x, y, width, height } = prop.visualCrop;
			const frame = `thought:${prop.id}`;
			if (!visual.texture.has(frame)) {
				// Phaser promotes the first added crop to the texture's default frame.
				// Keep the full image as default when the map/stall is recreated on re-entry.
				const defaultFrame = visual.texture.firstFrame;
				visual.texture.add(frame, 0, x, y, width, height);
				visual.texture.firstFrame = defaultFrame;
			}
			visual = scene.add.image(visual.x + x, visual.y + y, visual.texture.key, frame)
				.setOrigin(0).setDepth(visual.depth + 0.01);
		}
		interactions.addZone({
			id: `thought:${prop.id}`,
			x: prop.x,
			y: prop.y,
			radius: prop.radius,
			reachBounds: prop.reachBounds,
			indicatorOffset: prop.indicatorOffset,
			kind: "object",
			// Flavour never outranks gameplay: a thought that shares floor with a quest item, the
			// market gate or an NPC (the coop next to the gate, the bakery chairs next to a hiding
			// spot) must lose to it, or the real interaction becomes unreachable.
			priority: -1,
			// Shared scenery uses visualCrop; the highlighted subject is also the touch target.
			gameObject: visual ?? scene.add.rectangle(prop.x, prop.y - 20, 48, 48, 0, 0),
			visualObject: visual ?? undefined,
			onInteract: () => {
				if (dialogueBox.isActive()) return;
				const seen = gameState.count(`propSeen:${prop.id}`);
				const lines = gameState.flag("cakeGiven") && prop.afterCake ? prop.afterCake : seen > 0 && prop.again ? prop.again : prop.first;
				gameState.bump(`propSeen:${prop.id}`);
				pauseDuring(() => dialogueBox.play(lines, () => {
					if (seen === 0 && prop.firstReaction) onFirstReaction?.(prop.firstReaction);
					dialogueDone();
				}));
			},
		});
	}
}
