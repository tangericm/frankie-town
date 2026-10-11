import Phaser from "phaser";
import { FRANKIE_ORIGIN } from "../data/frankieAnim";

/**
 * Walks Frankie's sprite to a point with his walk cycle at its own foot anchor, as a tween: for
 * cutscene moments while the world is paused (stepping aside in Panini's flat). The caller
 * hands the physics body the landing spot afterwards (faceAndSpawn + body.reset), since a paused
 * world never re-syncs it from the sprite.
 */
export function walkSprite(
	scene: Phaser.Scene,
	frankie: Phaser.GameObjects.Sprite,
	to: { x: number; y: number },
	speed: number,
	then: () => void,
) {
	const dx = to.x - frankie.x;
	const dy = to.y - frankie.y;
	const dist = Math.hypot(dx, dy);
	if (dist < 1) {
		then();
		return;
	}
	const facing = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "east" : "west") : dy >= 0 ? "south" : "north";
	frankie.setOrigin(...FRANKIE_ORIGIN[`walking-${facing}`]);
	frankie.play(`frankie-walking-${facing}`, true);
	scene.tweens.add({
		targets: frankie,
		x: to.x,
		y: to.y,
		duration: (dist / speed) * 1000,
		onUpdate: () => frankie.setDepth(frankie.y),
		onComplete: then,
	});
}
