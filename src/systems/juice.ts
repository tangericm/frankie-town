import Phaser from "phaser";
import { PALETTE } from "./palette";
import { getAudio } from "./audio";

/**
 * The game-feel helpers, and the reward ladder built from them (docs/research/2026-09-14-game-audit.md §1).
 *
 * The first three (`squash`, `dustPuff`, `hitStop`) came from the break test; the rest came from
 * the audit's finding that every good moment in the game landed with the same weight, because the
 * vocabulary was spent evenly. Callers should reach for the ladder (`reward.tick` / `reward.pop`)
 * rather than assembling tweens, so a hen coming home and a correct basket press stay one size
 * apart by construction. The ingredient ceremony (the biggest routine size) lives in celebrate.ts
 * because it needs the journal.
 *
 * Nothing here needs a new animation sheet: tweens, generated textures, existing frames, camera
 * and sound only.
 */

type Hide = (o: Phaser.GameObjects.GameObject) => void;
const noHide: Hide = () => {};

const REDUCED_MOTION_KEY = "frankie:reducedMotion";

/** The OS reduced-motion preference, or the in-game Settings toggle (either one wins).
 * Decorative rewards stay stationary; nothing that carries information is removed. */
export function reducedMotion(scene?: Phaser.Scene): boolean {
	const os = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
	const chosen = scene ? readReducedMotionSetting(scene.game) : false;
	return os || chosen;
}

export function setReducedMotion(game: Phaser.Game, on: boolean) {
	game.registry.set(REDUCED_MOTION_KEY, on);
	try {
		localStorage.setItem(REDUCED_MOTION_KEY, on ? "1" : "0");
	} catch {
		// Storage unavailable: the setting holds for this session only.
	}
}

export function readReducedMotionSetting(game: Phaser.Game): boolean {
	const cached = game.registry.get(REDUCED_MOTION_KEY);
	if (typeof cached === "boolean") return cached;
	let stored = false;
	try {
		stored = localStorage.getItem(REDUCED_MOTION_KEY) === "1";
	} catch {
		stored = false;
	}
	game.registry.set(REDUCED_MOTION_KEY, stored);
	return stored;
}

/** A quick squash-and-recover on a sprite (Frankie picking something up). Keeps whatever scale
 * the sprite already has as its rest pose. */
export function squash(scene: Phaser.Scene, target: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image, amount = 0.14, ms = 90) {
	if (reducedMotion(scene)) return;
	const sx = target.scaleX;
	const sy = target.scaleY;
	scene.tweens.killTweensOf(target);
	target.setScale(sx * (1 + amount), sy * (1 - amount));
	scene.tweens.add({ targets: target, scaleX: sx, scaleY: sy, duration: ms * 2, ease: "Back.easeOut" });
}

const PUFF_KEY = "juice-dust-puff";
const DOT_KEY = "juice-dot";
const FEATHER_KEY = "juice-feather";

/** Shared by contact/reward puffs and chimney smoke, including a fresh Street entry. */
export function ensurePuffTexture(scene: Phaser.Scene) {
	if (scene.textures.exists(PUFF_KEY)) return;
	const g = scene.add.graphics();
	g.fillStyle(PALETTE.panelLight, 1);
	g.fillCircle(4, 4, 4);
	g.generateTexture(PUFF_KEY, 8, 8);
	g.destroy();
}

/** A white 4x4 square particle, tinted per burst. One texture for every colour. */
function ensureDotTexture(scene: Phaser.Scene) {
	if (scene.textures.exists(DOT_KEY)) return;
	const g = scene.add.graphics();
	g.fillStyle(0xffffff, 1);
	g.fillRect(0, 0, 4, 4);
	g.generateTexture(DOT_KEY, 4, 4);
	g.destroy();
}

/** A 3x6 white feather-ish sliver, tinted cream for hens and grey for pigeons. */
function ensureFeatherTexture(scene: Phaser.Scene) {
	if (scene.textures.exists(FEATHER_KEY)) return;
	const g = scene.add.graphics();
	g.fillStyle(0xffffff, 1);
	g.fillRect(1, 0, 1, 6);
	g.fillRect(0, 1, 3, 4);
	g.generateTexture(FEATHER_KEY, 3, 6);
	g.destroy();
}

/** A soft dust puff at the feet: two little circles that drift up-and-out and fade. World-space,
 * so the caller hides it from the UI camera. */
export function dustPuff(scene: Phaser.Scene, x: number, y: number, hide: Hide = noHide) {
	ensurePuffTexture(scene);
	for (const side of [-1, 1]) {
		const p = scene.add.image(x + side * 4, y - 1, PUFF_KEY).setAlpha(0.45).setScale(0.7).setDepth(y - 2);
		hide(p);
		scene.tweens.add({
			targets: p,
			x: x + side * (10 + Math.random() * 4),
			y: y - 6 - Math.random() * 3,
			alpha: 0,
			scale: 1.3,
			duration: 300,
			ease: "Quad.easeOut",
			onComplete: () => p.destroy(),
		});
	}
}

/** A short haptic tick where the platform has one (Android Chrome); a no-op elsewhere. */
export function buzz(ms = 12) {
	try {
		(navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate?.(ms);
	} catch {
		// Not available or not allowed: silence is fine.
	}
}

/** Freeze a tween for a beat, then let it go: the 40-80ms hit-stop that sells an impact. */
export function hitStop(scene: Phaser.Scene, tween: Phaser.Tweens.Tween | null, ms = 70, then?: () => void) {
	tween?.pause();
	scene.time.delayedCall(ms, () => {
		tween?.resume();
		then?.();
	});
}

export interface BurstOptions {
	/** Particle count; reduced motion uses one stationary fading particle. */
	count?: number;
	/** px/s. */
	speed?: { min: number; max: number };
	/** ms. */
	lifespan?: number;
	/** Downward acceleration; negative floats up (steam, flour). */
	gravityY?: number;
	/** Start scale; particles shrink to 0. */
	scale?: number;
	/** Emit angle range in degrees (Phaser's: 0 = east, 90 = south). Default all round. */
	angle?: { min: number; max: number };
	/** "dot" (default), "feather" (falls with a wobble) or "puff" (soft round). */
	shape?: "dot" | "feather" | "puff";
	depth?: number;
}

/** A one-shot burst of small particles in one colour at a world point. The pop size's centrepiece:
 * 8-14 particles in the thing's own colour (cream feathers for a hen, gold for sugar). Destroys
 * itself. */
export function burst(scene: Phaser.Scene, x: number, y: number, color: number, hide: Hide = noHide, opts: BurstOptions = {}) {
	ensureDotTexture(scene);
	ensureFeatherTexture(scene);
	ensurePuffTexture(scene);
	const shape = opts.shape ?? "dot";
	const key = shape === "feather" ? FEATHER_KEY : shape === "puff" ? PUFF_KEY : DOT_KEY;
	const still = reducedMotion(scene);
	const count = still ? 1 : Math.max(3, Math.round(opts.count ?? 10));
	const lifespan = opts.lifespan ?? 650;
	const emitter = scene.add.particles(x, y, key, {
		lifespan,
		speed: still ? 0 : opts.speed ?? { min: 40, max: 120 },
		angle: opts.angle ?? { min: 0, max: 360 },
		gravityY: still ? 0 : opts.gravityY ?? (shape === "feather" ? 90 : 160),
		scale: { start: opts.scale ?? 1, end: still ? opts.scale ?? 1 : 0 },
		alpha: { start: 1, end: still ? 0 : 0.2 },
		rotate: !still && shape === "feather" ? { start: 0, end: 200 } : 0,
		tint: color,
		quantity: 1,
		emitting: false,
	}).setDepth(opts.depth ?? y + 1);
	hide(emitter);
	emitter.explode(count);
	scene.time.delayedCall(lifespan + 80, () => emitter.destroy());
	return emitter;
}

/** An expanding stroked ring at a world point, or a stationary fade under reduced motion. */
export function ring(scene: Phaser.Scene, x: number, y: number, color: number, hide: Hide = noHide, opts: { radius?: number; depth?: number; ms?: number } = {}) {
	const r = scene.add.circle(x, y, opts.radius ?? 10).setStrokeStyle(2, color, 0.95).setDepth(opts.depth ?? 9000);
	hide(r);
	scene.tweens.add({ targets: r, ...(!reducedMotion(scene) ? { scale: 2.2 } : {}), alpha: 0, duration: opts.ms ?? 350, ease: "Cubic.easeOut", onComplete: () => r.destroy() });
	return r;
}

/** A sideways wobble on any positioned object (a wrong answer, a bump). Restores the start x. */
export function shake(scene: Phaser.Scene, target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, px = 3, ms = 240) {
	const x0 = target.x;
	const amount = reducedMotion(scene) ? Math.max(1, px / 2) : px;
	scene.tweens.add({
		targets: target,
		x: { from: x0 - amount, to: x0 + amount },
		duration: 40,
		yoyo: true,
		repeat: Math.max(1, Math.floor(ms / 80) - 1),
		onComplete: () => target.setX(x0),
	});
}

/** Two frames of solid white on a sprite: the "took a hit" flash. */
export function flashWhite(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite, frames = 2) {
	sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
	scene.time.delayedCall(frames * 34, () => {
		if (!sprite.scene) return;
		sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
	});
}

/** A small rising label ("+1", "Nice") at a world point. */
export function floatPip(scene: Phaser.Scene, x: number, y: number, text: string, hide: Hide = noHide, color: string = PALETTE.css.panelLight) {
	const still = reducedMotion(scene);
	const t = scene.add.text(x, y, text, {
		fontFamily: "\"Pixelify Sans\", monospace",
		fontSize: "14px",
		color,
		stroke: PALETTE.css.shadow,
		strokeThickness: 3,
	}).setOrigin(0.5).setDepth(9001).setScale(still ? 1 : 0.6);
	hide(t);
	if (!still) scene.tweens.add({ targets: t, scale: 1, duration: 140, ease: "Back.easeOut" });
	scene.tweens.add({ targets: t, ...(!still ? { y: y - 18 } : {}), alpha: 0, duration: 750, delay: 120, ease: "Quad.easeOut", onComplete: () => t.destroy() });
	return t;
}

export type EmoteKind = "!" | "?" | "heart" | "note" | "zz";
const EMOTE_GLYPH: Record<EmoteKind, string> = { "!": "!", "?": "?", heart: "♥", note: "♪", zz: "zz" };

/** A small speech-less bubble over a character's head: ! ? ♥ ♪ zz. Pops in, holds, fades. The
 * bubble follows the sprite while it lasts (Panini walks, Frankie hops). Returns the container so
 * a caller can cut it short. */
export function emote(
	scene: Phaser.Scene,
	target: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
	kind: EmoteKind,
	hide: Hide = noHide,
	opts: { offsetX?: number; offsetY?: number; holdMs?: number } = {},
): Phaser.GameObjects.Container {
	const offsetY = opts.offsetY ?? Math.round(target.displayHeight * target.originY) + 10;
	const offsetX = opts.offsetX ?? 6;
	const still = reducedMotion(scene);
	const isHeart = kind === "heart";
	const plate = scene.add.circle(0, 0, 9, PALETTE.panelLight, 0.96).setStrokeStyle(1.5, PALETTE.shadow, 1);
	const glyph = scene.add.text(0, 0, EMOTE_GLYPH[kind], {
		fontFamily: "\"Pixelify Sans\", monospace",
		fontSize: kind === "zz" ? "10px" : "13px",
		fontStyle: "bold",
		color: isHeart ? PALETTE.css.accent : PALETTE.css.accentDark,
	}).setOrigin(0.5, 0.55);
	const bubble = scene.add.container(target.x + offsetX, target.y - offsetY, [plate, glyph]).setDepth(9002).setScale(still ? 1 : 0);
	hide(bubble);
	const follow = () => {
		if (!bubble.scene || !target.scene) return;
		bubble.setPosition(target.x + offsetX, target.y - offsetY);
	};
	scene.events.on(Phaser.Scenes.Events.UPDATE, follow);
	let hold: Phaser.Time.TimerEvent | undefined;
	const cleanup = () => {
		hold?.remove(false);
		scene.tweens.killTweensOf(bubble);
		scene.events.off(Phaser.Scenes.Events.UPDATE, follow);
		scene.events.off(Phaser.Scenes.Events.SHUTDOWN, done);
		target.off(Phaser.GameObjects.Events.DESTROY, done);
		bubble.off(Phaser.GameObjects.Events.DESTROY, cleanup);
	};
	const done = () => {
		cleanup();
		if (bubble.scene) bubble.destroy();
	};
	scene.events.once(Phaser.Scenes.Events.SHUTDOWN, done);
	target.once(Phaser.GameObjects.Events.DESTROY, done);
	bubble.once(Phaser.GameObjects.Events.DESTROY, cleanup);
	if (!still) {
		scene.tweens.add({ targets: bubble, scale: 1, duration: 160, ease: "Back.easeOut" });
		scene.tweens.add({ targets: bubble, y: "-=3", duration: 380, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
	}
	hold = scene.time.delayedCall(opts.holdMs ?? 700, () => {
		if (!bubble.scene) return;
		scene.tweens.killTweensOf(bubble);
		scene.tweens.add({ targets: bubble, ...(!still ? { scale: 0 } : {}), alpha: 0, duration: 140, ease: "Back.easeIn", onComplete: done });
	});
	return bubble;
}

/** Frankie's happy hop: a bounce with a squash at the top, landing dust, and a yip (the bark
 * detuned up so it is not the dialogue bark). The one thing every reward has in common. */
export function hop(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite, hide: Hide = noHide, opts: { yip?: boolean; height?: number } = {}) {
	if (!sprite.scene) return;
	if (opts.yip !== false) getAudio(scene).sfx("bark", { volume: 0.35, detune: 300 });
	if (reducedMotion(scene)) return;
	const y0 = sprite.y;
	const sx = sprite.scaleX;
	const sy = sprite.scaleY;
	const height = opts.height ?? 10;
	scene.tweens.killTweensOf(sprite);
	sprite.setScale(sx * 1.1, sy * 0.9);
	scene.tweens.add({ targets: sprite, scaleX: sx, scaleY: sy, duration: 120, ease: "Quad.easeOut" });
	scene.tweens.add({
		targets: sprite,
		y: y0 - height,
		duration: 110,
		ease: "Quad.easeOut",
		yoyo: true,
		onComplete: () => {
			sprite.setY(y0).setScale(sx * 1.12, sy * 0.88);
			scene.tweens.add({ targets: sprite, scaleX: sx, scaleY: sy, duration: 160, ease: "Back.easeOut" });
			dustPuff(scene, sprite.x, sprite.y, hide);
		},
	});
}

/** The two routine sizes of the reward ladder. (`ceremony` is celebrate.ts's celebrateIngredient;
 * `finale` is the ending's own sequence.) */
export const reward = {
	/** Any accepted input: 90 ms squash and one short sound, nothing else. */
	tick(scene: Phaser.Scene, target: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image | null, sound: "journal-tick" | "ui-click" | "pickup" = "ui-click", rate = 1) {
		if (target?.scene) squash(scene, target, 0.1, 60);
		getAudio(scene).sfx(sound, { volume: 0.5, rate });
	},
	/** A sub-goal: a burst in the thing's colour, a rising two-note sting, a "+1" pip, a short
	 * hit-stop, and Frankie's hop if he is passed in. */
	pop(
		scene: Phaser.Scene,
		at: { x: number; y: number },
		color: number,
		hide: Hide = noHide,
		opts: { label?: string; frankie?: Phaser.GameObjects.Sprite | null; shape?: BurstOptions["shape"]; count?: number; sting?: boolean } = {},
	) {
		burst(scene, at.x, at.y, color, hide, { shape: opts.shape, count: opts.count ?? 12 });
		ring(scene, at.x, at.y, color, hide, { depth: 9000 });
		if (opts.label) floatPip(scene, at.x, at.y - 14, opts.label, hide);
		if (opts.sting !== false) {
			const audio = getAudio(scene);
			audio.sfx("journal-tick", { volume: 0.55, rate: 1.0 });
			scene.time.delayedCall(90, () => audio.sfx("journal-tick", { volume: 0.55, rate: 1.5 }));
		}
		buzz(14);
		if (opts.frankie) scene.time.delayedCall(70, () => opts.frankie?.scene && hop(scene, opts.frankie, hide, { yip: false }));
	},
};
