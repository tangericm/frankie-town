import Phaser from "phaser";
import { PALETTE } from "./palette";

const TEXTURE_KEY = "ambient-mote";

/**
 * A handful of warm dust motes drifting slowly upward -- the cheapest way (per
 * docs/research/ui-ux-conventions.md §1) to make a single static illustration read as "running"
 * rather than a paused screenshot. Themed as flour dust catching light rather than generic
 * leaves/fireflies, since this is a bakery-adjacent title screen. Low density (one every ~900ms)
 * on purpose -- this is atmosphere, not a snow effect.
 */
export function addAmbientMotes(scene: Phaser.Scene, width: number, top: number, bottom: number): Phaser.GameObjects.Particles.ParticleEmitter {
	if (!scene.textures.exists(TEXTURE_KEY)) {
		const g = scene.add.graphics();
		g.fillStyle(PALETTE.panelLight, 0.4);
		g.fillCircle(4, 4, 4);
		g.fillStyle(PALETTE.panelLight, 0.9);
		g.fillCircle(4, 4, 1.5);
		g.generateTexture(TEXTURE_KEY, 8, 8);
		g.destroy();
	}

	const emitter = scene.add.particles(0, 0, TEXTURE_KEY, {
		x: { min: 0, max: width },
		y: { min: bottom - 20, max: bottom + 10 },
		speedY: { min: -14, max: -6 },
		speedX: { min: -4, max: 4 },
		scale: { start: 0.5, end: 1.1 },
		alpha: { start: 0.8, end: 0 },
		lifespan: { min: 4500, max: 7000 },
		frequency: 900,
		blendMode: "ADD",
	});
	// Bound to the illustration's own vertical span, not the whole viewport, so motes don't drift
	// through the flat letterbox bands above/below it.
	const bounds = new Phaser.Geom.Rectangle(-20, top - 20, width + 40, bottom - top + 40);
	emitter.addDeathZone({ type: "onLeave", source: bounds });
	return emitter;
}
