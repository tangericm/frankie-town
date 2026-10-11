import Phaser from "phaser";

export interface BlockerBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

function sameBounds(a: Phaser.Geom.Rectangle, b: BlockerBounds) {
	return Math.abs(a.x - b.x) < 0.01
		&& Math.abs(a.y - b.y) < 0.01
		&& Math.abs(a.width - b.width) < 0.01
		&& Math.abs(a.height - b.height) < 0.01;
}

/** Adds a new invisible static Arcade body to a scene's world-collider group. */
export function addStaticBlocker(scene: Phaser.Scene, group: Phaser.Physics.Arcade.StaticGroup, bounds: BlockerBounds) {
	const blocker = scene.add.rectangle(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, bounds.width, bounds.height).setVisible(false);
	scene.physics.add.existing(blocker, true);
	group.add(blocker);
	return blocker;
}

/**
 * Removes a generated fallback collider matching the given bounds exactly -- for the recurring
 * "the export's sourceJson contains no foot shape, so the builder fell back to the whole object's
 * bounds" failure mode (the market arch, the coop doorway, the market's memory-lane rugs, the
 * street's own market archway all hit this once each).
 */
export function removeGeneratedBlocker(group: Phaser.Physics.Arcade.StaticGroup, bounds: BlockerBounds) {
	const child = group.getChildren().find((candidate) => {
		const object = candidate as Phaser.GameObjects.GameObject & { getBounds?: () => Phaser.Geom.Rectangle };
		return typeof object.getBounds === "function" && sameBounds(object.getBounds(), bounds);
	});
	if (child) group.remove(child, true, true);
}
