import Phaser from "phaser";
import { PALETTE } from "./palette";
import { burst, emote, ensurePuffTexture, reducedMotion, squash, type EmoteKind } from "./juice";

/**
 * Ambient motion and idle life (docs/research/2026-09-14-game-audit.md §2.5-2.6): the things that
 * make a room read as running rather than paused, and the cast read as alive rather than
 * breathing in place. Every helper here is decorative, cheap, and self-cleaning on scene shutdown
 * (timers and emitters are tied to the scene). Nothing gates anything.
 */

type Hide = (o: Phaser.GameObjects.GameObject) => void;
const noHide: Hide = () => {};

const RIPPLE_KEY = "ambient-ripple";
const SPARK_KEY = "ambient-spark";
const LEAF_KEY = "ambient-leaf";

/** Travelling twinkles identify a planted collectible without a ring around its furniture.
 * Reduced motion keeps the contrasting primary star and removes decorative travel. */
export function pickupGlint(scene: Phaser.Scene, item: Phaser.GameObjects.Image, hide: Hide = noHide) {
	const star = scene.add.star(0, 0, 4, 1.5, 5, PALETTE.panelLight).setStrokeStyle(1, PALETTE.border);
	const twinkles = [0, 1].map(() => scene.add.star(0, 0, 4, 0.8, 2.5, PALETTE.panelLight).setStrokeStyle(0.5, PALETTE.border));
	const glint = scene.add.container(0, 0, [star, ...twinkles]).setName(`pickup-glint:${item.texture.key}`);
	hide(glint);
	let elapsed = 0;
	const update = (_time: number, delta: number) => {
		const bounds = item.getBounds();
		const visible = item.visible && !scene.physics.world.isPaused && Phaser.Geom.Intersects.RectangleToRectangle(bounds, scene.cameras.main.worldView);
		glint.setVisible(visible);
		if (!visible) return;
		const still = reducedMotion(scene);
		if (!still) elapsed += Math.min(delta, 50);
		const pulse = (1 + Math.sin(elapsed * Math.PI * 2 / 2000)) / 2;
		glint.setPosition(Math.round(bounds.right + 2), Math.round(bounds.top + 4)).setDepth(item.depth + 0.01);
		star.setAlpha(still ? 1 : 0.35 + pulse * 0.65).setScale(still ? 1 : 0.65 + pulse * 0.5).setAngle(still ? 0 : 15 * Math.sin(elapsed / 750));
		twinkles.forEach((spark, i) => {
			const t = ((elapsed + i * 700) % 1800) / 1800;
			spark.setVisible(!still).setPosition(-bounds.width * (i ? 0.55 : 0.95), bounds.height * (i ? 0.1 : 0.7) - t * 12)
				.setAlpha(Math.sin(t * Math.PI)).setScale(0.5 + 0.6 * Math.sin(t * Math.PI));
		});
	};
	const stop = () => {
		scene.events.off(Phaser.Scenes.Events.UPDATE, update);
		scene.events.off(Phaser.Scenes.Events.SHUTDOWN, stop);
		item.off(Phaser.GameObjects.Events.DESTROY, stop);
		glint.destroy();
	};
	scene.events.on(Phaser.Scenes.Events.UPDATE, update);
	scene.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
	item.once(Phaser.GameObjects.Events.DESTROY, stop);
	update(0, 0);
	return stop;
}

function ensureTextures(scene: Phaser.Scene) {
	if (!scene.textures.exists(RIPPLE_KEY)) {
		// Two thin light lines on a transparent 32x16 tile; scrolled slowly it reads as a current.
		const g = scene.add.graphics();
		g.fillStyle(0xffffff, 1);
		g.fillRect(3, 3, 7, 1);
		g.fillRect(19, 10, 5, 1);
		g.fillRect(12, 14, 4, 1);
		g.generateTexture(RIPPLE_KEY, 32, 16);
		g.destroy();
	}
	if (!scene.textures.exists(SPARK_KEY)) {
		const g = scene.add.graphics();
		g.fillStyle(0xffffff, 1);
		g.fillRect(0, 0, 2, 2);
		g.generateTexture(SPARK_KEY, 2, 2);
		g.destroy();
	}
	if (!scene.textures.exists(LEAF_KEY)) {
		const g = scene.add.graphics();
		g.fillStyle(0xffffff, 1);
		g.fillRect(0, 1, 4, 2);
		g.fillRect(1, 0, 2, 4);
		g.generateTexture(LEAF_KEY, 4, 4);
		g.destroy();
	}
}

/** A slow current and a few blinking sparks over each water rectangle. Additive, faint. */
export function waterShimmer(scene: Phaser.Scene, rects: { x: number; y: number; width: number; height: number }[], hide: Hide = noHide, depth = -1000) {
	ensureTextures(scene);
	const still = reducedMotion(scene);
	for (const r of rects) {
		const tile = scene.add.tileSprite(r.x, r.y, r.width, r.height, RIPPLE_KEY).setOrigin(0).setAlpha(0.12).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth);
		hide(tile);
		if (!still) scene.tweens.add({ targets: tile, tilePositionX: 32, duration: 3200, repeat: -1 });
		const sparks = Math.max(2, Math.round((r.width * r.height) / 6000));
		for (let i = 0; i < sparks; i++) {
			const s = scene.add.image(r.x + 6 + Math.random() * (r.width - 12), r.y + 6 + Math.random() * (r.height - 12), SPARK_KEY)
				.setTint(PALETTE.panelLight).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth + 1);
			hide(s);
			scene.tweens.add({ targets: s, alpha: 0.85, duration: 500 + Math.random() * 400, yoyo: true, repeat: -1, repeatDelay: 900 + Math.random() * 2600, delay: Math.random() * 2000 });
		}
	}
}

/** A wisp of steam every `everyMs` from a point (a bread rack, an oven window, a kettle). */
export function steam(scene: Phaser.Scene, x: number, y: number, hide: Hide = noHide, everyMs = 1500, depth?: number, size: "normal" | "mug" = "normal") {
	const mug = size === "mug";
	const emit = () => {
		if (mug && reducedMotion(scene)) return;
		burst(scene, x + Phaser.Math.Between(mug ? -1 : -3, mug ? 1 : 3), y, 0xfff4d6, hide, {
			shape: "puff", count: 2, speed: mug ? { min: 1, max: 3 } : { min: 6, max: 16 },
			gravityY: mug ? -10 : -45, lifespan: 1300, scale: mug ? 0.25 : 0.6,
			angle: { min: 255, max: 285 }, depth: depth ?? y + 1,
		});
	};
	scene.time.addEvent({ delay: everyMs, loop: true, callback: emit });
}

/** Chimney smoke: a slow, faint column from a roofline point. Skipped under reduced motion. */
export function chimneySmoke(scene: Phaser.Scene, x: number, y: number, hide: Hide = noHide, depth = 9000) {
	if (reducedMotion(scene)) return;
	ensurePuffTexture(scene);
	const emitter = scene.add.particles(x, y, "juice-dust-puff", {
		lifespan: 2600,
		speedY: { min: -14, max: -22 },
		speedX: { min: 2, max: 8 },
		scale: { start: 0.5, end: 1.4 },
		alpha: { start: 0.35, end: 0 },
		tint: 0xd9cbb4,
		frequency: 520,
		quantity: 1,
	}).setDepth(depth);
	hide(emitter);
}

/** Soft slow motes inside a polygon (Panini's sunbeam), so the beam reads as light in air. */
export function beamMotes(scene: Phaser.Scene, points: readonly (readonly [number, number])[], hide: Hide = noHide, depth = -899) {
	ensureTextures(scene);
	const polygon = new Phaser.Geom.Polygon(points.map(([x, y]) => ({ x, y })));
	const bounds = Phaser.Geom.Polygon.GetAABB(polygon);
	// Rejection-sample the polygon's box: Phaser 4's Polygon has no getRandomPoint of its own.
	const source = {
		getRandomPoint(point: Phaser.Types.Math.Vector2Like) {
			for (let i = 0; i < 16; i++) {
				const x = bounds.x + Math.random() * bounds.width;
				const y = bounds.y + Math.random() * bounds.height;
				if (Phaser.Geom.Polygon.Contains(polygon, x, y)) { point.x = x; point.y = y; return point; }
			}
			point.x = bounds.centerX; point.y = bounds.centerY;
			return point;
		},
	};
	const emitter = scene.add.particles(0, 0, SPARK_KEY, {
		emitZone: new Phaser.GameObjects.Particles.Zones.RandomZone(source),
		lifespan: 4200,
		speedY: { min: -4, max: -9 },
		speedX: { min: -3, max: 3 },
		scale: { start: 0.6, end: 1.1 },
		alpha: { start: 0, end: 0.7, ease: "Sine.easeInOut" },
		tint: 0xffe9b0,
		frequency: reducedMotion(scene) ? 1400 : 700,
		quantity: 1,
		blendMode: Phaser.BlendModes.ADD,
	}).setDepth(depth);
	hide(emitter);
	return emitter;
}

/** A leaf or petal drifting across a band of the scene every 8-15 s, with a sine wobble. */
export function driftingLeaves(scene: Phaser.Scene, band: { x: number; y: number; width: number; height: number }, hide: Hide = noHide, colors = [0x9fb08a, 0xd9a860, 0xc47b70]) {
	if (reducedMotion(scene)) return;
	ensureTextures(scene);
	const launch = () => {
		const y0 = band.y + Math.random() * band.height;
		const leaf = scene.add.image(band.x - 8, y0, LEAF_KEY).setTint(colors[Phaser.Math.Between(0, colors.length - 1)]).setDepth(9000).setAlpha(0.9);
		hide(leaf);
		const duration = 7000 + Math.random() * 4000;
		scene.tweens.add({ targets: leaf, x: band.x + band.width + 8, duration, ease: "Linear", onComplete: () => leaf.destroy() });
		scene.tweens.add({ targets: leaf, y: y0 + 22, duration: 900 + Math.random() * 500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
		scene.tweens.add({ targets: leaf, angle: 360, duration: 2400, repeat: -1 });
		scene.time.delayedCall(8000 + Math.random() * 7000, launch);
	};
	scene.time.delayedCall(2500 + Math.random() * 4000, launch);
}

/** A warm glow disc under a lamp head (the second day's dusk). */
export function lampGlow(scene: Phaser.Scene, x: number, y: number, hide: Hide = noHide, depth = 9000) {
	const glow = scene.add.circle(x, y, 26, 0xffd58a, 0.16).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth);
	hide(glow);
	if (!reducedMotion(scene)) scene.tweens.add({ targets: glow, alpha: 0.24, scale: 1.08, duration: 1300 + Math.random() * 600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
	return glow;
}

/** A single bubble now and then from a point (Wilmo the sourdough starter, in the fridge). */
export function bubbles(scene: Phaser.Scene, x: number, y: number, hide: Hide = noHide, everyMs = 3000, depth?: number) {
	ensureTextures(scene);
	scene.time.addEvent({
		delay: everyMs,
		loop: true,
		callback: () => {
			const b = scene.add.circle(x + Phaser.Math.Between(-4, 4), y, 1.5).setStrokeStyle(1, PALETTE.panelLight, 0.9).setDepth(depth ?? y + 1);
			hide(b);
			scene.tweens.add({ targets: b, y: y - 10, alpha: 0, scale: 1.6, duration: 700, ease: "Quad.easeOut", onComplete: () => b.destroy() });
		},
	});
}

export interface IdleLifeHandle {
	/** Call every frame. */
	update(): void;
	/** Any deliberate interruption (a reward, a dialogue) resets the idle clock. */
	reset(): void;
}

/**
 * Frankie's idle behaviour without a new sheet: 8 s still → a "?"; 20 s → he settles (a slight
 * sit) with a quiet sleep cue now and then. Any input snaps him back with a squash. Nothing here rotates the
 * sprite: a whole-body tilt or wobble at this size reads as the dog shaking, not as a gesture.
 */
export function idleLife(
	scene: Phaser.Scene,
	sprite: Phaser.GameObjects.Sprite,
	isMoving: () => boolean,
	isBusy: () => boolean,
	hide: Hide = noHide,
): IdleLifeHandle {
	let idleSince = scene.time.now;
	let stage = 0;
	let nextZz = 0;
	let settled = false;
	const restScale = { x: sprite.scaleX, y: sprite.scaleY };
	const wake = () => {
		if (stage === 0) return;
		stage = 0;
		if (settled) {
			settled = false;
			sprite.setScale(restScale.x, restScale.y);
			squash(scene, sprite, 0.08, 70);
		}
	};
	return {
		reset() {
			idleSince = scene.time.now;
			wake();
		},
		update() {
			if (isMoving() || isBusy()) {
				idleSince = scene.time.now;
				wake();
				return;
			}
			const idle = scene.time.now - idleSince;
			if (stage === 0 && idle > 8000) {
				stage = 2;
				emote(scene, sprite, "?", hide);
			} else if (stage === 2 && idle > 20000) {
				stage = 3;
				settled = true;
				restScale.x = sprite.scaleX;
				restScale.y = sprite.scaleY;
				scene.tweens.add({ targets: sprite, scaleY: restScale.y * 0.92, scaleX: restScale.x * 1.04, duration: 500, ease: "Sine.easeOut" });
				nextZz = scene.time.now + 800;
			} else if (stage === 3 && scene.time.now >= nextZz) {
				nextZz = scene.time.now + 3500;
				emote(scene, sprite, "zz", hide, { holdMs: 1200 });
			}
		},
	};
}

/** Small periodic actions for a standing NPC. `kind` picks the gesture:
 *  - "knead": a squash and a puff of flour at the hands (Teddy);
 *  - "hum": a ♪ now and then (Rafa on the street, Michell at her desk);
 *  - "look": briefly play `lookAnim`, then return to `idleAnim` (Michell glancing up). */
export function npcFidget(
	scene: Phaser.Scene,
	sprite: Phaser.GameObjects.Sprite,
	kind: "knead" | "hum",
	hide: Hide = noHide,
	opts: { everyMs?: [number, number]; puffAt?: { x: number; y: number }; emote?: EmoteKind; emoteOffset?: { offsetX: number; offsetY: number } } = {},
) {
	const [lo, hi] = opts.everyMs ?? [6000, 9000];
	const tick = () => {
		if (!sprite.scene) return;
		if (kind === "knead") {
			squash(scene, sprite, 0.08, 90);
			const at = opts.puffAt ?? { x: sprite.x, y: sprite.y - 10 };
			burst(scene, at.x, at.y, 0xfff4d6, hide, { shape: "puff", count: 4, speed: { min: 8, max: 26 }, gravityY: -20, scale: 0.55, lifespan: 700, depth: sprite.depth + 1 });
		} else {
			emote(scene, sprite, opts.emote ?? "note", hide, opts.emoteOffset);
		}
		scene.time.delayedCall(Phaser.Math.Between(lo, hi), tick);
	};
	scene.time.delayedCall(Phaser.Math.Between(lo, hi), tick);
}
