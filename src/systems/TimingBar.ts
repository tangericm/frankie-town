import Phaser from "phaser";
import { PALETTE } from "./palette";
import { getAudio } from "./audio";
import { hitStop, buzz, reducedMotion } from "./juice";
import { getTextScale, TEXT_SCALE_CHANGED } from "./textScale";

/**
 * The one timing minigame in the game (docs/design/minigames-and-longevity.md §5d): a marker
 * sweeps back and forth along a bar, the player presses in the warm zone, three times. Used for
 * the bake at the end, and meant to stay rare -- "a timing bar stops being charming the fourth
 * time".
 *
 * It cannot be failed. A miss says so, kindly, and the round still counts; the score only changes
 * the flavour line. That is the whole game's failure rule (fail forward, produce a joke), and the
 * ending is the last place to break it.
 *
 * Screen-space UI built after attachGameplay's camera snapshot, so it has to be hidden from the
 * world camera explicitly (same as ItemReveal).
 */
export interface TimingBarOptions {
	/** One label per round, shown above the bar ("Mix", "Pour", "Bake"). Round count = length. */
	steps: string[];
	hideFromWorldCamera: (object: Phaser.GameObjects.GameObject) => void;
	onDone: (hits: number) => void;
	/** Fires on each press with the step index and whether it landed, so the caller can put an
	 * effect in the world (a flour cloud, a drip, oven steam) rather than only on this HUD. */
	onStep?: (step: number, hit: boolean) => void;
}

const BAR_W = 260;
const BAR_H = 18;
/** Fraction of the bar that counts as a hit, centred on a random point per round. */
const SWEET_FRACTION = 0.22;
/** One full left-to-right sweep, in ms. Slow enough to read on a phone joystick's latency. */
const SWEEP_MS = 1400;

/** Pure: did a press at `t` (0..1 along the bar) land in the zone centred at `centre`? */
export function isHit(t: number, centre: number, fraction = SWEET_FRACTION): boolean {
	return Math.abs(t - centre) <= fraction / 2;
}

export function runTimingBar(scene: Phaser.Scene, opts: TimingBarOptions) {
	const audio = getAudio(scene);
	const cx = 0;
	const cy = 0;
	const container = scene.add.container(0, 0).setScrollFactor(0).setDepth(20000);
	opts.hideFromWorldCamera(container);
	const layout = () => {
		scene.tweens.killTweensOf(container);
		container.setPosition(scene.scale.width / 2, Math.round(scene.scale.height * 0.42)).setAlpha(1);
		const scale = getTextScale(scene.game);
		title.setFontSize(18 * scale).setY(-BAR_H / 2 - 16 - title.height / 2);
		hint.setFontSize(12 * scale).setWordWrapWidth(Math.min(BAR_W + 24, scene.scale.width - 48)).setY(BAR_H / 2 + 16 + hint.height / 2);
		verdict.setFontSize(20 * scale).setY(title.y - title.height / 2 - 12 - verdict.height / 2);
		const top = title.y - title.height / 2 - 12, bottom = hint.y + hint.height / 2 + 12;
		plate.setSize(Math.min(BAR_W + 48, scene.scale.width - 24), bottom - top).setY((top + bottom) / 2);
	};

	const plate = scene.add.rectangle(cx, cy, BAR_W + 48, 108, PALETTE.panelDark, 0.86).setStrokeStyle(2, PALETTE.border, 0.9);
	const title = scene.add.text(cx, cy - 36, "", { fontFamily: "\"Pixelify Sans\", monospace", fontSize: "18px", color: PALETTE.css.panelLight }).setOrigin(0.5);
	const hint = scene.add.text(cx, cy + 36, scene.sys.game.device.input.touch ? "tap when the marker is in the warm zone" : "SPACE when the marker is in the warm zone", {
		fontFamily: "Nunito, sans-serif",
		fontSize: "12px",
		color: PALETTE.css.disabled, align: "center", wordWrap: { width: BAR_W + 24 },
	}).setOrigin(0.5);
	const track = scene.add.rectangle(cx, cy, BAR_W, BAR_H, PALETTE.panel, 0.9);
	const zone = scene.add.rectangle(cx, cy, BAR_W * SWEET_FRACTION, BAR_H, PALETTE.accent, 0.95);
	const marker = scene.add.rectangle(cx - BAR_W / 2, cy, 5, BAR_H + 10, PALETTE.text, 1);
	const verdict = scene.add.text(cx, cy - 66, "", { fontFamily: "\"Pixelify Sans\", monospace", fontSize: "20px", color: PALETTE.css.panelLight, stroke: PALETTE.css.shadow, strokeThickness: 4 }).setOrigin(0.5).setAlpha(0);
	container.add([plate, title, hint, track, zone, marker, verdict]);
	layout();
	scene.scale.on(Phaser.Scale.Events.RESIZE, layout);
	scene.game.registry.events.on(TEXT_SCALE_CHANGED, layout);
	container.setAlpha(0);
	scene.tweens.add({ targets: container, alpha: 1, duration: 200 });

	let round = 0;
	let hits = 0;
	let centre = 0.5;
	let accepting = false;
	const sweep = { t: 0 };
	let sweepTween: Phaser.Tweens.Tween | null = null;

	const startRound = () => {
		title.setText(opts.steps[round]);
		layout();
		centre = Phaser.Math.FloatBetween(0.25, 0.75);
		zone.setX(cx - BAR_W / 2 + centre * BAR_W);
		sweep.t = 0;
		sweepTween?.stop();
		sweepTween = scene.tweens.add({
			targets: sweep,
			t: 1,
			duration: SWEEP_MS,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
			onUpdate: () => marker.setX(cx - BAR_W / 2 + sweep.t * BAR_W),
		});
		accepting = true;
	};

	const showVerdict = (text: string, good: boolean) => {
		scene.tweens.killTweensOf(verdict);
		verdict.setText(text).setColor(good ? PALETTE.css.panelLight : PALETTE.css.disabled).setAlpha(1).setScale(reducedMotion(scene) ? 1 : 0.7);
		layout();
		if (!reducedMotion(scene)) scene.tweens.add({ targets: verdict, scale: 1, duration: 160, ease: "Back.easeOut" });
		scene.tweens.add({ targets: verdict, alpha: 0, duration: 250, delay: 500 });
	};

	const press = () => {
		if (!accepting) return;
		accepting = false;
		sweepTween?.stop();
		const hit = isHit(sweep.t, centre);
		opts.onStep?.(round, hit);
		if (hit) {
			hits += 1;
			audio.sfx("bar-hit");
			// A "+" pip rises off the marker: the hit is counted somewhere the eye already is.
			if (!reducedMotion(scene)) {
				const pip = scene.add.text(marker.x, cy - 14, "+", { fontFamily: "\"Pixelify Sans\", monospace", fontSize: "18px", color: PALETTE.css.accent, stroke: PALETTE.css.shadow, strokeThickness: 3 }).setOrigin(0.5);
				container.add(pip);
				scene.tweens.add({ targets: pip, y: cy - 34, alpha: 0, duration: 520, ease: "Quad.easeOut", onComplete: () => pip.destroy() });
			}
			// Hit-stop: the whole panel holds for 70ms with the marker frozen in the zone, then the
			// verdict and punch land together. Sells the "got it" harder than any animation.
			if (!reducedMotion(scene)) marker.setScale(1.8, 1.3);
			buzz(18);
			hitStop(scene, null, 70, () => {
				showVerdict(["Perfect!", "Lovely!", "Nailed it!"][Phaser.Math.Between(0, 2)], true);
				if (!reducedMotion(scene)) {
					scene.tweens.add({ targets: zone, scaleY: 1.6, duration: 90, yoyo: true });
					scene.tweens.add({ targets: marker, scaleX: 1, scaleY: 1, duration: 160, ease: "Back.easeOut" });
					scene.tweens.add({ targets: container, y: "+=3", duration: 40, yoyo: true });
				}
			});
		} else {
			audio.sfx("bar-miss", { volume: 0.6 });
			showVerdict(["Close enough.", "Rustic.", "Still counts."][Phaser.Math.Between(0, 2)], false);
		}
		round += 1;
		scene.time.delayedCall(650, () => {
			if (round < opts.steps.length) {
				startRound();
			} else {
				finish();
			}
		});
	};

	const key = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
	const onKey = () => press();
	key.on("down", onKey);
	// A tap on the journal tab or the gear is a UI tap (scrollFactor 0 objects), not a bake press.
	const onPointer = (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
		if (over.some((o) => (o as unknown as { scrollFactorX?: number }).scrollFactorX === 0)) return;
		press();
	};
	scene.input.on("pointerdown", onPointer);

	const cleanup = () => {
		scene.scale.off(Phaser.Scale.Events.RESIZE, layout);
		scene.game.registry.events.off(TEXT_SCALE_CHANGED, layout);
		key.off("down", onKey);
		scene.input.off("pointerdown", onPointer);
		sweepTween?.stop();
	};
	scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
	const finish = () => {
		cleanup();
		scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
		scene.tweens.add({
			targets: container,
			alpha: 0,
			duration: 220,
			onComplete: () => {
				container.destroy();
				opts.onDone(hits);
			},
		});
	};

	// A beat before the first sweep so the player sees the bar before it moves.
	scene.time.delayedCall(350, startRound);
}
