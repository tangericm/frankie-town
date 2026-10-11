import Phaser from "phaser";
import { DINNER_CLUES, DINNER_DELIVERY, dinnerCluesFound } from "../data/dinner";
import type { SceneKey } from "../data/objectives";
import type { GameState } from "./GameState";
import type { InteractionManager } from "./InteractionManager";
import type { DialogueBox } from "./DialogueBox";
import type { JournalUI } from "./JournalUI";
import { flyPickup, taDa } from "./celebrate";
import { showDinnerLetter } from "./DinnerLetter";
import type { DialogueLine } from "./DialogueSequencer";
import { reward, reducedMotion, emote } from "./juice";
import { getAudio } from "./audio";
import { PIGEON_ANIMATIONS } from "../data/market.gameplay";
import { pickupGlint } from "./ambient";
import { PALETTE } from "./palette";

/** Detailed source pixels are kept at 3x world size, rather than discarded into coarse cells. */
function keepsake(scene: Phaser.Scene, x: number, y: number, texture: string, width: number) {
	const image = scene.add.image(x, y, texture).setOrigin(0.5, 1);
	image.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
	return image.setScale(width / image.width);
}

export function attachDinnerClues(ctx: { scene: Phaser.Scene; sceneKey: SceneKey; state: GameState; interactions: InteractionManager; dialogue: DialogueBox; pause: (play: () => void) => void; done: () => void; journal: JournalUI; frankie: Phaser.GameObjects.Sprite; ignore: (object: Phaser.GameObjects.GameObject) => void }) {
	const { scene, sceneKey, state, interactions, dialogue, pause, done, journal, frankie, ignore } = ctx;
	const placed = new Set<string>();
	const cues = new Map<string, () => void>();
	let delivering = false;
	let notePlaced = false;
	const guide = sceneKey === "Street" ? scene.add.container(0, 0, [
		scene.add.graphics(), scene.add.text(0, 16, "Café tables", { fontFamily: "Nunito, sans-serif", fontSize: "15px", fontStyle: "bold", color: PALETTE.css.panelLight, stroke: PALETTE.css.shadow, strokeThickness: 4, resolution: 2 }).setOrigin(0.5),
	]).setName("dinner-cafe-guide").setScrollFactor(0, 0, true).setDepth(9800).setVisible(false) : null;
	if (guide) scene.cameras.main.ignore(guide);
	const ready = () => state.flag("cakeGiven") && state.flag("dinnerStarted") && !state.flag("dinnerRevealed");
	const collected = () => dinnerCluesFound(state) === DINNER_CLUES.length;
	const pickup = (id: string, image: Phaser.GameObjects.Image, save: () => void, lines: DialogueLine[]) => {
		if (scene.physics.world.isPaused || dialogue.isActive()) return;
		cues.get(id)?.();
		cues.delete(id);
		interactions.removeZone(id);
		pause(() => {
			save(); // Save before flight: reload or leaving the scene cannot lose a keepsake.
			getAudio(scene).sfx("pickup");
			reward.pop(scene, { x: image.x, y: image.y - 8 }, 0xd9b27c, ignore, { frankie: reducedMotion(scene) ? null : frankie, label: `${dinnerCluesFound(state)} / ${DINNER_CLUES.length}`, count: collected() ? 18 : 9, sting: false });
			flyPickup(scene, image, () => journal.getIngredientScreenPosition(id) ?? { x: scene.scale.width - 34, y: 34 }, () => {
				journal.pulse();
				if (collected()) { scene.time.delayedCall(120, () => taDa(scene)); lines.push({ speaker: "Frankie", text: "All three! Back to the Street, to the outdoor café tables west of home. Let's see what our pigeon has been keeping under his wing.", thought: true }); }
				dialogue.play(lines, done);
			});
		});
	};
	const placeNote = () => {
		if (notePlaced || sceneKey !== "Street" || !ready() || !collected() || !state.flag("dinnerNoteDropped")) return;
		notePlaced = true;
		const note = keepsake(scene, DINNER_DELIVERY.x, DINNER_DELIVERY.y, "dinner-note", DINNER_DELIVERY.noteWidth).setDepth(DINNER_DELIVERY.y);
		ignore(note);
		cues.set("dinner:note", pickupGlint(scene, note, ignore));
		interactions.addZone({ id: "dinner:note", x: note.x, y: note.y, radius: 32, priority: 1, kind: "item", gameObject: note, minTapSize: 44,
			onInteract: () => {
				if (scene.physics.world.isPaused || dialogue.isActive()) return;
				cues.get("dinner:note")?.(); cues.delete("dinner:note"); interactions.removeZone("dinner:note");
				pause(() => {
					const cam = scene.cameras.main, from = { x: (note.x - cam.worldView.x) * cam.zoom + cam.x, y: (note.y - cam.worldView.y) * cam.zoom + cam.y };
					note.destroy(); getAudio(scene).sfx("pickup");
					showDinnerLetter(scene, from, o => scene.cameras.main.ignore(o), decoded => {
						if (decoded) state.setFlag("dinnerRevealed");
						done();
						if (!decoded) { notePlaced = false; placeNote(); }
					});
				});
			} });
	};
	const place = () => {
		if (!ready()) return;
		for (const clue of DINNER_CLUES) {
			if (clue.scene !== sceneKey || state.flag(clue.flag) || placed.has(clue.id)) continue;
			placed.add(clue.id);
			const image = keepsake(scene, clue.x, clue.y, clue.texture, clue.width).setDepth(clue.depth);
			ignore(image);
			cues.set(`dinner:${clue.id}`, pickupGlint(scene, image, ignore));
			// A new keepsake outranks the now-empty cupboard and repeat furniture thoughts.
			interactions.addZone({ id: `dinner:${clue.id}`, ...clue.stand, radius: clue.radius ?? 38,
				reachBounds: clue.id === "bowls" ? { x: 240, y: 137, width: 56, height: 18 } : { x: clue.x - clue.width / 2, y: clue.y - 8, width: clue.width, height: 8 },
				priority: 1, kind: "item", gameObject: image, minTapSize: 44,
				onInteract: () => pickup(`dinner:${clue.id}`, image, () => state.setFlag(clue.flag), [clue.text, clue.memory].map(text => ({ speaker: "Frankie", text, thought: true }))) });
		}
		placeNote();
	};
	const update = () => {
		if (guide) {
			const active = ready() && collected() && !state.flag("dinnerNoteDropped") && !delivering && !scene.physics.world.isPaused;
			guide.setVisible(active);
			if (active) {
				const cam = scene.cameras.main, w = scene.scale.width, h = scene.scale.height;
				const tx = (DINNER_DELIVERY.x - cam.worldView.x) * cam.zoom + cam.x, ty = (DINNER_DELIVERY.y - cam.worldView.y) * cam.zoom + cam.y;
				const x = Math.max(64, Math.min(w - 64, tx)), y = Math.max(150, Math.min(h - 72, ty - 38));
				guide.setPosition(x, y);
				const angle = Math.atan2(ty - y, tx - x), pointer = guide.list[0] as Phaser.GameObjects.Graphics;
				pointer.clear().fillStyle(PALETTE.shadow).fillTriangle(-9, -9, 9, -9, 0, 10).fillStyle(PALETTE.panelLight).fillTriangle(-6, -7, 6, -7, 0, 6);
				pointer.setRotation(angle - Math.PI / 2);
			}
		}
		if (sceneKey !== "Street" || delivering || scene.physics.world.isPaused || !ready() || !collected() || state.flag("dinnerNoteDropped")) return;
		if (Math.hypot(frankie.x - DINNER_DELIVERY.x, frankie.y - DINNER_DELIVERY.y) > 140) return;
		delivering = true;
		guide?.setVisible(false);
		pause(() => {
			const cam = scene.cameras.main;
			cam.stopFollow();
			if (reducedMotion(scene)) cam.centerOn(DINNER_DELIVERY.x, DINNER_DELIVERY.y);
			else cam.pan(DINNER_DELIVERY.x, DINNER_DELIVERY.y, 300, "Sine.easeInOut");
			for (const animation of [PIGEON_ANIMATIONS.walkEast, PIGEON_ANIMATIONS.idleEast, PIGEON_ANIMATIONS.flapEast]) {
				if (!scene.anims.exists(animation.key)) scene.anims.create({ key: animation.key, frames: scene.anims.generateFrameNumbers(animation.texture, { start: animation.startFrame, end: animation.endFrame }), frameRate: animation.frameRate, repeat: -1 });
			}
			const bird = scene.add.sprite(DINNER_DELIVERY.fromX, DINNER_DELIVERY.y, PIGEON_ANIMATIONS.walkEast.texture).setOrigin(0.5, 34 / 44).setDepth(DINNER_DELIVERY.y + 1).setName("dinner-courier");
			ignore(bird);
			bird.play(PIGEON_ANIMATIONS.walkEast.key);
			const envelope = keepsake(scene, bird.x + 12, bird.y - 8, "dinner-note", 14).setDepth(bird.depth + 1);
			ignore(envelope);
			scene.tweens.add({ targets: bird, x: DINNER_DELIVERY.x - 16, duration: 2200, onUpdate: () => envelope.setPosition(bird.x + 12, bird.y - 8), onComplete: () => {
				bird.play(PIGEON_ANIMATIONS.idleEast.key);
				emote(scene, bird, "!", ignore);
				scene.time.delayedCall(600, () => {
					scene.tweens.add({ targets: envelope, x: DINNER_DELIVERY.x, y: DINNER_DELIVERY.y, scale: DINNER_DELIVERY.noteWidth / envelope.width, duration: reducedMotion(scene) ? 0 : 320, ease: "Sine.easeOut", onComplete: () => {
						envelope.destroy();
						state.setFlag("dinnerNoteDropped"); // Reload keeps the landed note; earlier interruption retries.
						getAudio(scene).sfx("pickup", { volume: 0.5 });
						scene.time.delayedCall(450, () => {
							bird.setDepth(10000).play(PIGEON_ANIMATIONS.flapEast.key);
							scene.tweens.add({ targets: bird, x: DINNER_DELIVERY.toX, y: DINNER_DELIVERY.y - 140, scale: 0.7, duration: reducedMotion(scene) ? 0 : 1400, ease: "Sine.easeIn", onComplete: () => {
								scene.tweens.add({ targets: bird, alpha: 0, duration: 180, onComplete: () => { bird.destroy(); cam.startFollow(frankie, true); done(); } });
							} });
						});
					} });
				});
			} });
		});
	};
	place();
	state.onChange(place);
	scene.events.on(Phaser.Scenes.Events.UPDATE, update);
	scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
		state.offChange(place);
		scene.events.off(Phaser.Scenes.Events.UPDATE, update);
	});
	return guide;
}
