import Phaser from "phaser";
import { PALETTE } from "./palette";
import { getAudio } from "./audio";
import { reducedMotion } from "./juice";
import { getTextScale, TEXT_SCALE_CHANGED } from "./textScale";

/**
 * A full-screen "you got the item" beat -- for a moment that should read as more significant
 * than the routine pickup-and-fly-to-journal animation (see attachGameplay.ts's fetch items):
 * receiving flour is Teddy actually handing over the quest reward, not just spotting an object
 * lying around. Dims the screen, pops the icon up big with a burst of sparkles and a light
 * flash, holds a beat, then shrinks away -- the "item unlocked" shape common to RPGs.
 */
const SPARKLE_KEY = "item-reveal-sparkle";

function ensureSparkleTexture(scene: Phaser.Scene) {
	if (scene.textures.exists(SPARKLE_KEY)) return;
	const g = scene.add.graphics();
	g.fillStyle(PALETTE.accent, 1);
	g.fillCircle(4, 4, 4);
	g.fillStyle(PALETTE.panelLight, 1);
	g.fillCircle(4, 4, 1.5);
	g.generateTexture(SPARKLE_KEY, 8, 8);
	g.destroy();
}

/**
 * `hideFromWorldCamera` must hide the overlay from the scrolling world camera. This is screen-space
 * UI (scrollFactor 0, sized from scale.width/height), but it is built at pickup time -- long after
 * attachGameplay's one-shot `cameras.main.ignore(uiObjects)` snapshot -- so without it the overlay
 * renders on BOTH cameras: two dim layers, two icons, and two labels at two different sizes.
 */
export function showItemReveal(
	scene: Phaser.Scene,
	textureKey: string,
	label: string,
	hideFromWorldCamera: (object: Phaser.GameObjects.GameObject) => void = () => {},
	opts: { silent?: boolean; onDone?: () => void } = {},
) {
	const w = scene.scale.width;
	const h = scene.scale.height;
	const cx = w / 2;
	const cy = h / 2;
	const still = reducedMotion(scene);
	if (!still) ensureSparkleTexture(scene);
	// `silent` when the ceremony that leads into this card has already played its ta-da.
	if (!opts.silent) getAudio(scene).sfx("reward");

	const container = scene.add.container(0, 0).setScrollFactor(0).setDepth(20000);
	hideFromWorldCamera(container);

	const dim = scene.add.rectangle(0, 0, w, h, 0x000000, 0).setOrigin(0);
	container.add(dim);

	// A quick radial flash behind the icon -- reads as "something just happened here", separate
	// from the icon's own pop-in.
	const flash = scene.add.circle(cx, cy, 10, PALETTE.panelLight, 0.9).setScale(0.1).setVisible(!still);
	container.add(flash);

	const icon = scene.add.image(cx, cy, textureKey).setScale(still ? 3 : 0.1).setAlpha(0);
	container.add(icon);

	const label_ = scene.add
		.text(cx, cy + 70, label, {
			fontFamily: "\"Pixelify Sans\", monospace",
			fontSize: `${20 * getTextScale(scene.game)}px`, align: "center", wordWrap: { width: w - 32 },
			color: PALETTE.css.panelLight,
			stroke: PALETTE.css.shadow,
			strokeThickness: 5,
			fontStyle: "bold",
		})
		.setOrigin(0.5)
		.setAlpha(0);
	container.add(label_);

	const sparkles = still ? null : scene.add.particles(cx, cy, SPARKLE_KEY, {
		lifespan: 700,
		speed: { min: 80, max: 180 },
		scale: { start: 1.4, end: 0 },
		quantity: 1,
		frequency: 40,
		emitting: false,
	});
	if (sparkles) container.add(sparkles);
	const layout = () => {
		const w = scene.scale.width, h = scene.scale.height;
		dim.setSize(w, h);
		icon.setPosition(w / 2, h / 2);
		flash.setPosition(w / 2, h / 2);
		sparkles?.setPosition(w / 2, h / 2);
		label_.setPosition(w / 2, h / 2 + 70).setFontSize(20 * getTextScale(scene.game)).setWordWrapWidth(w - 32);
	};
	const cleanup = () => {
		scene.scale.off(Phaser.Scale.Events.RESIZE, layout);
		scene.game.registry.events.off(TEXT_SCALE_CHANGED, layout);
	};
	scene.scale.on(Phaser.Scale.Events.RESIZE, layout);
	scene.game.registry.events.on(TEXT_SCALE_CHANGED, layout);
	scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);

	scene.tweens.add({ targets: dim, fillAlpha: 0.55, duration: 180 });
	if (!still) scene.tweens.add({ targets: flash, scale: 4, alpha: 0, duration: 450, ease: "Cubic.easeOut" });
	scene.tweens.add({
		targets: icon,
		...(!still ? { scale: 3 } : {}),
		alpha: 1,
		duration: 380,
		ease: "Back.easeOut",
		onStart: () => sparkles?.explode(14),
	});
	scene.tweens.add({ targets: label_, alpha: 1, duration: 250, delay: 200 });

	scene.time.delayedCall(1500, () => {
		scene.tweens.add({ targets: icon, ...(!still ? { scale: 0 } : {}), alpha: 0, duration: 220, ease: "Back.easeIn" });
		scene.tweens.add({ targets: label_, alpha: 0, duration: 220 });
		scene.tweens.add({
			targets: dim,
			fillAlpha: 0,
			duration: 300,
			delay: 100,
			onComplete: () => {
				cleanup();
				scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
				sparkles?.destroy();
				container.destroy();
				opts.onDone?.();
			},
		});
	});
}
