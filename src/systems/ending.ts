import Phaser from "phaser";
import type { GameState } from "./GameState";
import type { DialogueBox } from "./DialogueBox";
import type { DialogueLine } from "./DialogueSequencer";
import { runTimingBar } from "./TimingBar";
import { getAudio } from "./audio";
import { burst, emote, reducedMotion, squash } from "./juice";
import { findImageByTexture } from "./propThoughts";
import { makeButton } from "./panel";
import { PALETTE } from "./palette";
import { getTextScale, TEXT_SCALE_CHANGED } from "./textScale";
import { FRANKIE_ORIGIN } from "../data/frankieAnim";
import {
	BAKE_INTRO_LINES,
	BAKE_STEPS,
	BAKE_SPOT,
	BAKE_RESULT_LINES,
	CAKE_SPOT,
	MICHELL_WALK,
	MICHELL_AT_TABLE,
	FRANKIE_MEET_SPOT,
	MICHELL_REACTION_LINES,
	MICHELL_FLOWER_LINE,
	CREDITS,
} from "../data/ending";

export interface EndingContext {
	scene: Phaser.Scene;
	gameState: GameState;
	dialogueBox: DialogueBox;
	frankie: Phaser.GameObjects.Sprite;
	michell: Phaser.GameObjects.Sprite;
	/** Wraps a dialogue in the world-pause the rest of the game uses. */
	pauseDuring: (play: () => void) => void;
	dialogueDone: () => void;
	hideFromWorldCamera: (object: Phaser.GameObjects.GameObject) => void;
	ignoreInUi: (object: Phaser.GameObjects.GameObject) => void;
	/** The scene's own spawn helper: moves Frankie and his physics body together. */
	faceAndSpawn: (x: number, y: number, facing: "north" | "south" | "east" | "west") => void;
	/** Removes the ingredient props from the apartment -- they've gone into the cake. */
	consumeIngredients: () => void;
	onFinished: () => void;
	/** A save written between the bake and the credits (bakeDone set, cakeGiven not): the cake is
	 * already made, so pick up from Michell noticing rather than baking twice. */
	resumeAfterBake?: boolean;
}

// Foot anchors measured from each source frame, so changing direction never shifts her off her feet.
const MICHELL_ORIGINS: Record<string, [number, number]> = {
	"idle-north": [0.5, 71 / 84], "idle-south": [0.5, 74 / 88],
	"idle-east": [31.5 / 64, 72 / 84], "idle-west": [32.5 / 64, 72 / 84],
	"walking-north": [0.5, 78 / 92], "walking-south": [0.5, 78 / 92],
	"walking-east": [0.5, 75 / 88], "walking-west": [0.5, 75 / 88],
};
const WALK_SPEED = 60; // px/s, Michell's unhurried pace

/** The photo: where Frankie sits for it, what the frame is centred on, and its size in world px. */
const PHOTO_POSE = { frankie: { x: 320, y: 386 }, centre: { x: 284, y: 320 }, w: 216, h: 224 };
const PHOTO_TEXTURE = "ending-photo";

/**
 * A polaroid of the snapshot over the room, with Save (share sheet where there is one, else a
 * download) and Keep. Built on the UI camera. Everything here is DOM-free except the save itself.
 */
function showPhoto(scene: Phaser.Scene, snap: HTMLImageElement, hide: (o: Phaser.GameObjects.GameObject) => void, done: () => void) {
	if (scene.textures.exists(PHOTO_TEXTURE)) scene.textures.remove(PHOTO_TEXTURE);
	scene.textures.addImage(PHOTO_TEXTURE, snap);
	const w = scene.scale.width;
	const h = scene.scale.height;
	const scale = Math.min(1, (w - 64) / snap.width, (h - 220) / snap.height);
	const frameW = Math.max(260, snap.width * scale + 32);
	const frameH = snap.height * scale + 108;
	const layer = scene.add.container(w / 2, h / 2).setScrollFactor(0).setDepth(21000).setAlpha(0).setScale(0.9);
	hide(layer);
	const dim = scene.add.rectangle(0, 0, w * 2, h * 2, PALETTE.shadow, 0.55);
	const frame = scene.add.rectangle(0, 0, frameW, frameH, PALETTE.panelLight, 1).setStrokeStyle(2, PALETTE.border, 1);
	const pic = scene.add.image(0, -38, PHOTO_TEXTURE).setScale(scale);
	const date = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
	const caption = scene.add.text(0, frameH / 2 - 42, `Happy birthday, Michell!\nFrankie, Michell & Rafa\n${date}`, {
		fontFamily: "\"Pixelify Sans\", monospace",
		fontSize: "16px", align: "center", wordWrap: { width: frameW - 24 }, padding: { x: 2, y: 3 }, resolution: 2,
		color: PALETTE.css.text,
	}).setOrigin(0.5);
	const by = frameH / 2 + 34;
	const save = makeButton(scene, -132, by - 22, "Save photo", () => savePhoto(snap, date), { width: 124, height: 44 });
	const keep = makeButton(scene, 8, by - 22, "Keep going", () => close(), { width: 124, height: 44 });
	const buttons = [save, keep];
	const keyHint = scene.add.text(0, 0, "Tab / arrows: choose · Enter: activate · Space: keep", { fontFamily: "Nunito, sans-serif", fontSize: "12px", color: PALETTE.css.panelLight, align: "center", stroke: PALETTE.css.shadow, strokeThickness: 3 }).setOrigin(0.5).setVisible(!scene.sys.game.device.input.touch);
	const paper = scene.add.container(0, 0, [frame, pic]).setAngle(-2);
	layer.add([dim, paper, caption, ...buttons, keyHint]);
	layer.setScrollFactor(0, 0, true);
	const layoutPhoto = () => {
		const w = scene.scale.width, h = scene.scale.height;
		const textScale = getTextScale(scene.game);
		const width = Math.min(w - 48, Math.max(260, snap.width + 32));
		caption.setFontSize(16 * textScale).setWordWrapWidth(width - 24);
		keyHint.setFontSize(12 * textScale).setWordWrapWidth(w - 48);
		const actionsH = 12 + 44 + (keyHint.visible ? 8 + keyHint.height : 0);
		const scale = Math.min(1, (width - 32) / snap.width, Math.max(40, h - 48 - 44 - caption.height - actionsH) / snap.height);
		const height = snap.height * scale + 44 + caption.height;
		layer.setPosition(w / 2, h / 2 - actionsH / 2);
		dim.setSize(w * 2, h * 2);
		frame.setSize(width, height);
		pic.setScale(scale).setY(-height / 2 + 16 + snap.height * scale / 2);
		caption.setY(height / 2 - 16 - caption.height / 2);
		save.setY(height / 2 + 12); keep.setY(height / 2 + 12);
		keyHint.setY(height / 2 + 12 + 44 + 8 + keyHint.height / 2);
	};
	layoutPhoto();
	scene.scale.on(Phaser.Scale.Events.RESIZE, layoutPhoto);
	scene.game.registry.events.on(TEXT_SCALE_CHANGED, layoutPhoto);
	const cleanPhoto = () => {
		scene.scale.off(Phaser.Scale.Events.RESIZE, layoutPhoto);
		scene.game.registry.events.off(TEXT_SCALE_CHANGED, layoutPhoto);
		scene.input.keyboard?.off("keydown", onKey);
	};
	scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanPhoto);
	if (!reducedMotion(scene)) {
		const colors = [PALETTE.accent, PALETTE.panelLight, 0xb5c99a, 0xc47b70];
		for (let i = 0; i < 36; i++) {
			const piece = scene.add.rectangle((i / 35 - 0.5) * w, -h / 2 - 12, 3, 6, colors[i % colors.length]);
			layer.add(piece);
			scene.tweens.add({ targets: piece, x: piece.x + Math.sin(i * 2.4) * 55, y: h / 2 + 20, angle: (i % 2 ? 1 : -1) * 280, alpha: 0, delay: i * 16, duration: 1700 + i % 5 * 120, onComplete: () => piece.destroy() });
		}
	}

	if (reducedMotion(scene)) layer.setAlpha(1).setScale(1);
	else scene.tweens.add({ targets: layer, alpha: 1, scale: 1, duration: 320, ease: "Back.easeOut" });
	getAudio(scene).sfx("reward", { volume: 0.6 });
	let focused = 1;
	keep.setFocused(true);
	const onKey = (event: KeyboardEvent) => {
		if (event.repeat || closed) return;
		if (event.code === "Tab" || event.code.startsWith("Arrow")) {
			const back = event.shiftKey || event.code === "ArrowLeft" || event.code === "ArrowUp";
			focused = (focused + (back ? -1 : 1) + buttons.length) % buttons.length;
			buttons.forEach((button, i) => button.setFocused(i === focused));
		} else if (event.code === "Enter") buttons[focused].activate();
		else if (event.code === "Space" || event.code === "Escape") close();
		else return;
		event.preventDefault();
		event.stopPropagation();
		scene.input.keyboard?.addKey(event.keyCode).reset();
	};
	scene.input.keyboard?.on("keydown", onKey);
	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		cleanPhoto();
		scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanPhoto);
		scene.tweens.add({ targets: layer, alpha: 0, duration: 220, onComplete: () => { layer.destroy(); done(); } });
	};
}

/** Composites the polaroid onto a canvas and hands it to the share sheet or a download. */
function savePhoto(snap: HTMLImageElement, date: string) {
	const pad = 24;
	const canvas = document.createElement("canvas");
	canvas.width = snap.width * 2 + pad * 2;
	canvas.height = snap.height * 2 + pad * 2 + 120;
	const g = canvas.getContext("2d");
	if (!g) return;
	g.imageSmoothingEnabled = false;
	g.fillStyle = PALETTE.css.panelLight;
	g.fillRect(0, 0, canvas.width, canvas.height);
	g.drawImage(snap, pad, pad, snap.width * 2, snap.height * 2);
	g.fillStyle = PALETTE.css.text;
	g.font = "bold 26px 'Pixelify Sans', monospace";
	g.textAlign = "center";
	g.fillText("Happy birthday, Michell!", canvas.width / 2, canvas.height - 92);
	g.fillText("Frankie, Michell & Rafa", canvas.width / 2, canvas.height - 60);
	g.font = "22px Nunito, sans-serif";
	g.fillText(date, canvas.width / 2, canvas.height - 26);
	canvas.toBlob((blob) => {
		if (!blob) return;
		const file = new File([blob], "frankie-and-michell.png", { type: "image/png" });
		const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
		if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
			nav.share({ files: [file], title: "Frankie & Michell" }).catch(() => downloadBlob(blob));
			return;
		}
		downloadBlob(blob);
	}, "image/png");
}

function downloadBlob(blob: Blob) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "frankie-and-michell.png";
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Places the cake on the table (used at the ending, and on every later visit while the flag is
 * set).
 */
export function placeCake(scene: Phaser.Scene, ignoreInUi: (o: Phaser.GameObjects.GameObject) => void): Phaser.GameObjects.Image | null {
	if (!scene.textures.exists("cake")) return null;
	const cake = scene.add.image(CAKE_SPOT.x, CAKE_SPOT.y, "cake").setOrigin(0.5, 1).setScale(CAKE_SPOT.scale).setDepth(CAKE_SPOT.depth);
	ignoreInUi(cake);
	if (!reducedMotion(scene)) {
		for (const [x, y, delay] of [[15, 11, 0], [24, 5, 170], [32, 12, 290]]) {
			const flame = scene.add.rectangle(CAKE_SPOT.x + (x - 24) * CAKE_SPOT.scale, CAKE_SPOT.y + (y - 48) * CAKE_SPOT.scale, 1, 2, 0xffefad, 0.9).setDepth(CAKE_SPOT.depth + 1).setOrigin(0.5, 1);
			ignoreInUi(flame);
			scene.tweens.add({ targets: flame, alpha: 0.35, scaleY: 0.65, duration: 260 + delay, delay, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
		}
	}
	return cake;
}

/** Moves Michell from her working pose at the desk to standing, smiling, at the table, without a
 * walk. */
export function seatMichellAtTable(michell: Phaser.GameObjects.Sprite) {
	michell.setOrigin(0.5, 1).setPosition(MICHELL_AT_TABLE.x, MICHELL_AT_TABLE.y).setDepth(MICHELL_AT_TABLE.y);
	smileMichell(michell);
}

/** The reviewed smiling frame (the same one the photo uses) in place of the neutral idle loop.
 * Once she has seen the cake she stays smiling: through her reaction, the photo, and every later
 * visit to the table. Falls back to the idle animation if the frame is not loaded. */
export function smileMichell(michell: Phaser.GameObjects.Sprite) {
	if (!michell.scene.textures.exists("michell-photo-smile")) {
		playMichell(michell, "idle", MICHELL_AT_TABLE.facing);
		return;
	}
	michell.anims.stop();
	michell.setTexture("michell-photo-smile").setOrigin(0.5, 72 / 84);
}

export function playMichell(michell: Phaser.GameObjects.Sprite, state: "idle" | "walking", facing: string) {
	const scene = michell.scene;
	const key = `michell-${state}-${facing}`;
	if (!scene.anims.exists(key)) {
		if (!scene.textures.exists(`${key}-sheet`)) return;
		scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(`${key}-sheet`, {}), frameRate: state === "walking" ? 9 : 6, repeat: -1 });
	}
	michell.play(key, true).setOrigin(...MICHELL_ORIGINS[`${state}-${facing}`]);
}

/**
 * The whole ending, start to finish. Called once, right after Rafa's ENDING_DIALOGUE closes with
 * every ingredient in hand. Everything here runs with the world paused; the player only presses
 * during the timing bar and to advance lines.
 */
export function runEnding(ctx: EndingContext) {
	const { scene, gameState, dialogueBox, frankie, michell } = ctx;
	const audio = getAudio(scene);
	const cam = scene.cameras.main;

	const say = (lines: DialogueLine[], then: () => void) => {
		ctx.pauseDuring(() => dialogueBox.play(lines, () => {
			// Keep the world paused between beats; dialogueDone() only at the very end.
			then();
		}));
	};

	/** Walks Frankie to a spot. A tween, not input: the world is paused. Lands through the scene's
	 * own spawn helper so the physics body arrives with him. */
	const walkFrankie = (to: { x: number; y: number; facing: "north" | "south" | "east" | "west" }, then: () => void) => {
		const dx = to.x - frankie.x;
		const dy = to.y - frankie.y;
		const dist = Math.hypot(dx, dy);
		if (dist < 1) {
			ctx.faceAndSpawn(to.x, to.y, to.facing);
			then();
			return;
		}
		const walkFacing = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "east" : "west") : dy >= 0 ? "south" : "north";
		frankie.setOrigin(...FRANKIE_ORIGIN[`walking-${walkFacing}`]);
		frankie.play(`frankie-walking-${walkFacing}`, true);
		scene.tweens.add({
			targets: frankie,
			x: to.x,
			y: to.y,
			duration: (dist / 70) * 1000,
			onUpdate: () => frankie.setDepth(frankie.y),
			onComplete: () => {
				ctx.faceAndSpawn(to.x, to.y, to.facing);
				then();
			},
		});
	};

	// 1. Rafa sends him to the kitchen (skipped when resuming a save made after the bake).
	if (!ctx.resumeAfterBake) say(BAKE_INTRO_LINES, () => {
		// 2. Frankie walks to the stove.
		walkFrankie(BAKE_SPOT, () => {
			// 3. The bake itself. Each step lands in the world, not only on the HUD bar: Mix puffs a
			//    flour cloud off the counter and squashes Frankie; Pour drips batter into the pan; Bake
			//    warms the oven window and sends up steam. Imperfect presses still do the action.
			const stove = findImageByTexture(scene, "o_c16efb33");
			const counter = { x: BAKE_SPOT.x + 26, y: BAKE_SPOT.y - 22 };
			const bakeEffect = (step: number, hit: boolean) => {
				if (!hit) emote(scene, frankie, "?", ctx.ignoreInUi, { holdMs: 420 });
				if (step === 0) {
					if (!reducedMotion(scene)) squash(scene, frankie, hit ? 0.12 : 0.06);
					burst(scene, counter.x, counter.y, 0xfff4d6, ctx.ignoreInUi, { shape: "puff", count: hit ? 12 : 7, speed: { min: 15, max: hit ? 55 : 34 }, gravityY: -25, lifespan: 900, scale: hit ? 0.9 : 0.7 });
				} else if (step === 1) {
					burst(scene, counter.x, counter.y - 6, 0xd9a860, ctx.ignoreInUi, { count: hit ? 5 : 3, speed: { min: 5, max: 20 }, gravityY: 220, angle: hit ? { min: 80, max: 100 } : { min: 65, max: 115 }, scale: 0.8, lifespan: 500 });
				} else {
					if (stove?.scene) {
						stove.setTint(0xffd2a0);
						scene.time.delayedCall(1400, () => stove.scene && stove.clearTint());
					}
					for (const delay of hit ? [0, 220, 440] : [0, 300]) {
						scene.time.delayedCall(delay, () => burst(scene, counter.x + 4, counter.y - 10, 0xfff4d6, ctx.ignoreInUi, { shape: "puff", count: 3, speed: { min: 8, max: 22 }, gravityY: -55, lifespan: 1100, scale: hit ? 0.8 : 0.6, angle: { min: 255, max: 285 } }));
					}
				}
			};
			runTimingBar(scene, {
				steps: BAKE_STEPS,
				hideFromWorldCamera: ctx.hideFromWorldCamera,
				onStep: bakeEffect,
				onDone: (hits) => {
					gameState.setFlag("bakeDone");
					ctx.consumeIngredients();
					audio.sfx("reward");
					const cake = placeCake(scene, ctx.ignoreInUi);
					if (cake) {
						cake.setScale(0.2).setAlpha(0);
						scene.tweens.add({ targets: cake, scale: CAKE_SPOT.scale, alpha: 1, duration: 320, ease: "Back.easeOut" });
						burst(scene, CAKE_SPOT.x, CAKE_SPOT.y - 14, 0xfff1a8, ctx.ignoreInUi, { count: 16, speed: { min: 40, max: 130 }, depth: CAKE_SPOT.depth + 2 });
					}
					cam.stopFollow();
					cam.pan(CAKE_SPOT.x, CAKE_SPOT.y, 700, "Sine.easeInOut");
					// The finale's camera push: a small zoom in on the cake and back.
					if (!reducedMotion(scene)) {
						const zoom0 = cam.zoom;
						scene.tweens.add({ targets: cam, zoom: zoom0 * 1.08, duration: 400, yoyo: true, ease: "Sine.easeInOut", onComplete: () => cam.setZoom(zoom0) });
					}
					say(BAKE_RESULT_LINES[Math.max(0, Math.min(3, hits)) as 0 | 1 | 2 | 3], () => walkMichell());
				},
			});
		});
	});

	// 4. Michell notices, gets up, comes over. Frankie leaves the stove and comes down to meet her
	//    at the table, so her thank-you is said to him and not across the kitchen.
	const walkMichell = () => {
		michell.setOrigin(0.5, 1);
		// Michell is already standing by the window when the ingredients arrive.
		const legs = [...MICHELL_WALK];
		let frankieArrived = false;
		let michellArrived = false;
		const meet = () => {
			if (!frankieArrived || !michellArrived) return;
			const lines = gameState.flag("windowBoxBloomed")
				? [...MICHELL_REACTION_LINES.slice(0, 4), MICHELL_FLOWER_LINE, ...MICHELL_REACTION_LINES.slice(4)]
				: MICHELL_REACTION_LINES;
			scene.time.delayedCall(400, () => say(lines, () => credits()));
		};
		const step = () => {
			const next = legs.shift();
			if (!next) {
				michell.setPosition(MICHELL_AT_TABLE.x, MICHELL_AT_TABLE.y).setDepth(MICHELL_AT_TABLE.y);
				// She sees the cake: smiling from here on.
				smileMichell(michell);
				michellArrived = true;
				meet();
				return;
			}
			const dx = next.x - michell.x, dy = next.y - michell.y;
			const facing = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "east" : "west") : dy >= 0 ? "south" : "north";
			playMichell(michell, "idle", facing);
			const dist = Phaser.Math.Distance.Between(michell.x, michell.y, next.x, next.y);
			scene.tweens.add({
				targets: michell,
				x: next.x,
				y: next.y,
				delay: 140,
				onStart: () => playMichell(michell, "walking", facing),
				duration: (dist / WALK_SPEED) * 1000,
				onUpdate: () => michell.setDepth(michell.y),
				onComplete: step,
			});
		};
		cam.stopFollow();
		cam.pan(michell.x, michell.y + 60, 600, "Sine.easeInOut");
		scene.time.delayedCall(500, step);
		// He sets off a beat after she does, and has the shorter walk, so they arrive together.
		scene.time.delayedCall(900, () => walkFrankie(FRANKIE_MEET_SPOT, () => {
			frankieArrived = true;
			meet();
		}));
	};

	// 5. Quiet credits over the room, then hand the game back.
	const credits = () => {
		const w = scene.scale.width;
		const h = scene.scale.height;
		const layer = scene.add.container(0, 0).setScrollFactor(0).setDepth(21000);
		ctx.hideFromWorldCamera(layer);
		const dim = scene.add.rectangle(0, 0, w, h, PALETTE.shadow, 0).setOrigin(0);
		const text = scene.add.text(w / 2, h / 2, "", {
			fontFamily: "\"Pixelify Sans\", monospace",
			fontSize: "20px", padding: { x: 4, y: 4 }, resolution: 2, wordWrap: { width: Math.max(200, w - 48) },
			color: PALETTE.css.panelLight,
			align: "center",
			stroke: PALETTE.css.shadow,
			strokeThickness: 4,
			lineSpacing: 8,
		}).setOrigin(0.5).setAlpha(0);
		layer.add([dim, text]);
		const layoutCredits = () => {
			dim.setSize(scene.scale.width, scene.scale.height);
			text.setFontSize(20 * getTextScale(scene.game)).setPosition(scene.scale.width / 2, scene.scale.height / 2).setWordWrapWidth(Math.max(200, scene.scale.width - 48));
		};
		layoutCredits();
		scene.scale.on(Phaser.Scale.Events.RESIZE, layoutCredits);
		scene.game.registry.events.on(TEXT_SCALE_CHANGED, layoutCredits);
		const cleanCredits = () => { scene.scale.off(Phaser.Scale.Events.RESIZE, layoutCredits); scene.game.registry.events.off(TEXT_SCALE_CHANGED, layoutCredits); };
		scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanCredits);
		scene.tweens.add({ targets: dim, fillAlpha: 0.55, duration: 900 });

		const lines = [...CREDITS];
		const showNext = () => {
			const line = lines.shift();
			if (line === undefined) {
				scene.tweens.add({
					targets: dim,
					fillAlpha: 0,
					duration: 900,
					onComplete: () => {
						cleanCredits();
						scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanCredits);
						layer.destroy();
						photo();
					},
				});
				return;
			}
			text.setText(line).setAlpha(0);
			scene.tweens.add({ targets: text, alpha: 1, duration: 600 });
			scene.tweens.add({ targets: text, alpha: 0, duration: 600, delay: 2400, onComplete: showNext });
		};
		scene.time.delayedCall(700, showNext);
	};

	// 6. One photo of the three of them, then the game is handed back.
	const photo = () => {
		// Pose: Frankie beside Michell at the table, both facing the camera.
		ctx.faceAndSpawn(PHOTO_POSE.frankie.x, PHOTO_POSE.frankie.y, "south");
		michell.setPosition(328, 290).setDepth(290);
		// Fixed, reviewed frames keep the snapshot out of blinks and animation transitions.
		michell.anims.stop();
		michell.setTexture("michell-photo-smile").setOrigin(0.5, 72 / 84);
		frankie.anims.stop();
		frankie.setTexture("frankie-idle-south-sheet", 0);
		const rafa = scene.children.list.find(o => (o as Phaser.GameObjects.Sprite).texture?.key?.startsWith("rafa-idle")) as Phaser.GameObjects.Sprite | undefined;
		const rafaBefore = rafa ? { x: rafa.x, y: rafa.y, animation: rafa.anims.currentAnim?.key } : null;
		rafa?.setPosition(244, 386).setDepth(386);
		rafa?.anims.stop();
		rafa?.setTexture("rafa-idle-south-sheet", 0);
		cam.stopFollow();
		cam.centerOn(PHOTO_POSE.centre.x, PHOTO_POSE.centre.y);
		const finish = () => {
			gameState.setFlag("cakeGiven");
			seatMichellAtTable(michell);
			if (rafa && rafaBefore) {
				rafa.setPosition(rafaBefore.x, rafaBefore.y).setDepth(rafaBefore.y);
				if (rafaBefore.animation) rafa.play(rafaBefore.animation);
			}
			cam.startFollow(frankie, true);
			ctx.dialogueDone();
			ctx.onFinished();
		};
		scene.time.delayedCall(450, () => {
			const zoom = cam.zoom;
			const sx = cam.x + (PHOTO_POSE.centre.x - PHOTO_POSE.w / 2 - cam.worldView.x) * zoom;
			const sy = cam.y + (PHOTO_POSE.centre.y - PHOTO_POSE.h / 2 - cam.worldView.y) * zoom;
			const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer | Phaser.Renderer.Canvas.CanvasRenderer;
			try {
				renderer.snapshotArea(Math.round(sx), Math.round(sy), Math.round(PHOTO_POSE.w * zoom), Math.round(PHOTO_POSE.h * zoom), (snap) => {
					if (!(snap instanceof HTMLImageElement)) {
						finish();
						return;
					}
					showPhoto(scene, snap, ctx.hideFromWorldCamera, finish);
				});
			} catch {
				finish();
			}
		});
	};

	if (ctx.resumeAfterBake) {
		ctx.consumeIngredients();
		placeCake(scene, ctx.ignoreInUi);
		ctx.pauseDuring(() => {});
		cam.stopFollow();
		cam.pan(CAKE_SPOT.x, CAKE_SPOT.y, 700, "Sine.easeInOut");
		scene.time.delayedCall(800, () => walkMichell());
	}

}
