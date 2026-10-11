import Phaser from "phaser";
import type { JournalUI } from "./JournalUI";
import { showItemReveal } from "./ItemReveal";
import { getAudio } from "./audio";
import { burst, hop, ring, squash, reducedMotion } from "./juice";

/** The same lift-and-fly used by bakery supplies and the post-cake keepsakes. Save before calling. */
export function flyPickup(scene: Phaser.Scene, sprite: Phaser.GameObjects.Image, target: () => { x: number; y: number }, done: () => void) {
	const fly = () => {
		const point = target();
		const world = scene.cameras.main.getWorldPoint(point.x, point.y);
		sprite.setDepth(9600);
		scene.tweens.add({ targets: sprite, x: world.x, y: world.y, scale: 0.15, alpha: 0, duration: 380, ease: "Cubic.easeIn", onComplete: () => { sprite.destroy(); done(); } });
	};
	if (reducedMotion(scene)) {
		scene.tweens.add({ targets: sprite, alpha: 0, duration: 180, onComplete: () => { sprite.destroy(); done(); } });
	} else scene.tweens.add({ targets: sprite, y: sprite.y - 10, scale: sprite.scaleX * 1.25, duration: 120, ease: "Back.easeOut", onComplete: fly });
}

/**
 * The ceremony size of the reward ladder (docs/research/2026-09-14-game-audit.md §2.2): an
 * ingredient earned. Shared by the four grants (Teddy's flour, Pierre's eggs, the third sugar
 * cube, Panini's butter) so they land with the same, largest routine weight:
 *
 *   1. the source squashes and bursts in the ingredient's colour;
 *   2. Frankie does his happy hop;
 *   3. the ingredient icon spawns at the source and arcs into the journal (its row when open, the
 *      corner tab when folded), then the row stamps itself with the three-note ta-da;
 *   4. only then the full-screen reveal card, so the eye follows one thing at a time.
 *
 * `addIngredient` is the caller's job and must already have happened (the save is written before
 * any animation, same rule as the bakery supplies), so the row is already checked when the icon
 * lands on it.
 */
export interface CelebrateContext {
	scene: Phaser.Scene;
	journal: JournalUI;
	frankie: Phaser.GameObjects.Sprite | null;
	pauseDuring: (play: () => void) => void;
	/** Hides a freshly made world object from the UI camera. */
	ignoreInUi: (o: Phaser.GameObjects.GameObject) => void;
	/** Hides a freshly made screen-space object from the world camera. */
	hideFromWorldCamera: (o: Phaser.GameObjects.GameObject) => void;
}

export interface CelebrateOptions {
	/** Texture key of the ingredient icon (also used for the reveal card). */
	texture: string;
	/** The reveal card's label ("Flour!"). */
	label: string;
	/** Where the icon spawns and the burst happens, in world space (the giver, the cupboard). */
	source: { x: number; y: number };
	/** The thing that hands it over, squashed as it does. */
	giver?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image | null;
	/** Burst colour: cream for flour, straw for eggs, gold for sugar, butter-yellow for butter. */
	color: number;
	/** The journal row this lands on. */
	ingredient: string;
	/** Release the caller's world lock after the full-screen card has closed. */
	onDone?: () => void;
}

export const INGREDIENT_COLORS: Record<string, number> = {
	flour: 0xfff4d6,
	eggs: 0xe8c27a,
	sugar: 0xfff1a8,
	butter: 0xf2c94c,
};

/** Three rising notes from the one tick sample: the "ta-da" every ingredient shares. */
export function taDa(scene: Phaser.Scene) {
	const audio = getAudio(scene);
	audio.sfx("journal-tick", { volume: 0.6, rate: 1.0 });
	scene.time.delayedCall(110, () => audio.sfx("journal-tick", { volume: 0.6, rate: 1.26 }));
	scene.time.delayedCall(220, () => audio.sfx("reward", { volume: 0.7 }));
}

export function celebrateIngredient(ctx: CelebrateContext, opts: CelebrateOptions) {
	const { scene, journal } = ctx;
	ctx.pauseDuring(() => {});
	const landed = () => {
		journal.stampRow(opts.ingredient);
		taDa(scene);
		scene.time.delayedCall(240, () => showItemReveal(scene, opts.texture, opts.label, ctx.hideFromWorldCamera, { silent: true, onDone: opts.onDone }));
	};
	if (reducedMotion(scene)) { landed(); return; }
	if (opts.giver?.scene) squash(scene, opts.giver, 0.12);
	burst(scene, opts.source.x, opts.source.y - 8, opts.color, ctx.ignoreInUi, { count: 14, speed: { min: 50, max: 140 } });
	ring(scene, opts.source.x, opts.source.y - 8, opts.color, ctx.ignoreInUi);
	if (ctx.frankie) scene.time.delayedCall(60, () => hop(scene, ctx.frankie!, ctx.ignoreInUi));

	const icon = scene.add.image(opts.source.x, opts.source.y - 8, opts.texture).setDepth(9600).setScale(0.2).setAlpha(0);
	ctx.ignoreInUi(icon);
	// Lift out of the giver, pause on the crest, then arc away.
	scene.tweens.add({ targets: icon, y: opts.source.y - 30, scale: 1, alpha: 1, duration: 220, ease: "Back.easeOut" });
	scene.time.delayedCall(420, () => {
		const screenTarget = journal.getIngredientScreenPosition(opts.ingredient) ?? { x: scene.scale.width - 34, y: 28 };
		const target = scene.cameras.main.getWorldPoint(screenTarget.x, screenTarget.y);
		const from = { x: icon.x, y: icon.y };
		const crest = Math.min(from.y, target.y) - 60;
		const t = { v: 0 };
		scene.tweens.add({
			targets: t,
			v: 1,
			duration: 620,
			ease: "Quad.easeIn",
			onUpdate: () => {
				// Quadratic bezier through a crest above both ends: an arc, not a straight slide.
				const u = 1 - t.v;
				icon.x = u * u * from.x + 2 * u * t.v * ((from.x + target.x) / 2) + t.v * t.v * target.x;
				icon.y = u * u * from.y + 2 * u * t.v * crest + t.v * t.v * target.y;
				icon.setScale(1 - 0.75 * t.v);
			},
			onComplete: () => {
				icon.destroy();
				landed();
			},
		});
	});
}
