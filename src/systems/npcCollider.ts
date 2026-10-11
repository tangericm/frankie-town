import Phaser from "phaser";

export interface NpcColliderSpec {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Bottom-edge-anchored footprint rectangle for a static NPC collider: (spec.x, spec.y) is the
 * NPC's own foot-anchor point (matches Frankie's own body -- see body.setSize/setOffset in
 * Apartment.ts/Bakery.ts), so the box's bottom edge lands exactly on that point
 * instead of straddling it.
 */
export function footprintRect(spec: NpcColliderSpec): { x: number; y: number; width: number; height: number } {
	return { x: spec.x, y: spec.y - spec.height / 2, width: spec.width, height: spec.height };
}

/**
 * Adds an invisible static Arcade body for one NPC and collides it against Frankie -- the same
 * pattern attachGameplay.ts already uses for bakery fetch-item hitboxes: a separate rectangle,
 * not a body on the sprite itself (sprites here are frequently non-uniform/rotated, and a
 * collider only ever affects the pair it's explicitly added for).
 */
export function addNpcCollider(scene: Phaser.Scene, frankie: Phaser.GameObjects.Sprite, spec: NpcColliderSpec): Phaser.GameObjects.Rectangle {
	const r = footprintRect(spec);
	const box = scene.add.rectangle(r.x, r.y, r.width, r.height).setVisible(false);
	box.setData("npcColliderId", spec.id);
	scene.physics.add.existing(box, true);
	scene.physics.add.collider(frankie, box);
	return box;
}
