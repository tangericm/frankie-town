import Phaser from "phaser";
import type { GameState } from "./GameState";
import type { DialogueBox } from "./DialogueBox";
import type { InteractionManager, InteractionZone } from "./InteractionManager";
import type { DialogueLine } from "./DialogueSequencer";
import { FRANKIE_ASIDE, PANINI_REST, PANINI_SUNBEAM, PANINIS_LINES, PANINIS_ZONES } from "../data/paninis-flat.gameplay";
import { walkSprite } from "./walk";
import { findImageByTexture } from "./propThoughts";
import { addStaticBlocker } from "./worldColliders";
import { buildGrid, findPath, smoothPath } from "./pathfinding";
import { getAudio } from "./audio";
import type { JournalUI } from "./JournalUI";
import { celebrateIngredient, INGREDIENT_COLORS } from "./celebrate";
import { emote, reward, reducedMotion } from "./juice";

interface Services {
	gameState: GameState;
	dialogueBox: DialogueBox;
	interactions: InteractionManager;
	journal: JournalUI;
	frankie: Phaser.GameObjects.Sprite;
	faceAndSpawn(x: number, y: number, facing: "north" | "south" | "east" | "west"): void;
	pauseDuring(play: () => void): void;
	dialogueDone(): void;
	ignoreInUi(object: Phaser.GameObjects.GameObject): void;
	hideFromWorldCamera(object: Phaser.GameObjects.GameObject): void;
	invalidateNavigation(): void;
}

/** The editable room's behaviour lives here; rebuilding its scene never overwrites the quest. */
export class PaninisFlatGameplay {
	private cat: Phaser.GameObjects.Sprite;
	private blocker: Phaser.GameObjects.Rectangle | null = null;
	private beam: Phaser.GameObjects.Graphics;
	private cupboardGlass: Phaser.GameObjects.Image;
	private busy = false;
	private stopped = false;
	private rest: number;
	private zones = new Map<string, InteractionZone>();
	private images = new Map<string, Phaser.GameObjects.Image>();
	constructor(private scene: Phaser.Scene, private colliders: Phaser.Physics.Arcade.StaticGroup, private services: Services) {
		const state = services.gameState;
		state.revealIngredient("butter");
		// Preserve completion from the earlier one-lure puzzle, with the new final pose.
		if (state.flag("paniniMoved")) state.setFlag("paniniCurtainsOpen");
		this.rest = state.flag("paniniMoved") ? 2 : 0;
		const p = PANINI_REST[this.rest];
		this.cat = scene.add.sprite(p.x, p.y, "panini-loaf-south-sheet", 0).setOrigin(0.5, 0.85).setDepth(p.y);
		for (const dir of ["south", "east", "west", "north"]) {
			for (const action of ["loaf", "walking"]) {
				const key = `panini-${action}-${dir}`;
				if (!scene.anims.exists(key)) scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(`${key}-sheet`, {}), frameRate: 7, repeat: -1 });
			}
		}
		this.cat.play("panini-loaf-south");
		this.placeBlocker();
		this.beam = scene.add.graphics().setDepth(-900).setBlendMode(Phaser.BlendModes.ADD);
		this.beam.fillStyle(0xffce83, 0.19);
		this.beam.fillPoints(PANINI_SUNBEAM.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
		this.beam.setAlpha(state.flag("paniniCurtainsOpen") ? 1 : 0);
		// Preserve the original cabinet. Its pane is foreground glass over the separate dish.
		const cupboard = this.image("pn-ButterCupboard");
		this.cupboardGlass = scene.add.image(cupboard.x, cupboard.y, cupboard.texture.key).setOrigin(0).setCrop(13, 24, 39, 21).setDepth(157).setAlpha(0.28).setName("panini-cupboard-glass");
		services.ignoreInUi(this.cupboardGlass);
		if (state.flag("paniniCurtainsOpen")) this.image("pn-CurtainsClosed").setTexture("pn-curtains-open");
		if (state.hasIngredient("butter")) this.showEmptyCupboard();
		this.registerZones();
		// The same cupboard interaction is available by tapping its guard.
		const touch = Boolean(scene.sys.game.device.input.touch);
		this.cat.setInteractive().on(touch ? "pointerup" : "pointerdown", (pointer: Phaser.Input.Pointer) => {
			if (!services.interactions.canInteractPointer(pointer)) return;
			if (touch && (pointer.getDuration() > 350 || Math.hypot(pointer.x - pointer.downX, pointer.y - pointer.downY) >= 8)) return;
			if (this.busy || services.dialogueBox.isActive() || this.rest !== 0) return;
			if (services.interactions.nearestId() === "paninis-butter") this.interact("butter");
			else if (!scene.sys.game.device.input.touch) scene.events.emit("zone:tap", { id: "paninis-butter", ...PANINIS_ZONES.butter, onInteract: () => this.interact("butter") });
		});
		if (this.rest !== 0) { this.cat.disableInteractive(); this.sleep(); }
		scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.stopped = true; scene.tweens.killTweensOf(this.cat); });
	}
	private image(key: string) {
		// Open-state swaps change the texture key, so look up by original key once and keep it.
		const existing = this.images.get(key);
		if (existing) return existing;
		const image = findImageByTexture(this.scene, key);
		if (!image) throw new Error(`Missing Panini room prop: ${key}`);
		this.images.set(key, image);
		return image;
	}
	private say(lines: DialogueLine[], done = () => {}) {
		this.services.pauseDuring(() => this.services.dialogueBox.play(lines, () => { this.services.dialogueDone(); done(); }));
	}
	private registerZones() {
		for (const [id, z] of Object.entries(PANINIS_ZONES)) {
			const image = this.image(z.texture);
			if (this.zones.has(id)) continue;
			const state = this.services.gameState;
			const zone: InteractionZone = { id: `paninis-${id}`, ...z, kind: "object", gameObject: image,
				action: () => {
					if (id === "butter") return !state.hasIngredient("butter") && state.flag("paniniMoved") ? "Take" : "Look";
					if (state.flag("paniniMoved")) return "Look";
					if (id === "curtains") return state.flag("paniniToyTried") && state.flag("paniniBasketTried") ? "Open" : "Look";
					return state.flag(id === "toy" ? "paniniToyTried" : "paniniBasketTried") ? "Look" : "Try";
				},
				onInteract: () => this.interact(id) };
			this.zones.set(id, zone);
			this.services.interactions.addZone(zone);
		}
	}
	private showEmptyCupboard() {
		this.cupboardGlass.setVisible(false);
		this.image("pn-ButterCupboard").setTexture("pn-cupboard-open");
		this.image("pn-ButterDish").setVisible(false);
	}
	private placeBlocker() {
		this.blocker = addStaticBlocker(this.scene, this.colliders, { x: this.cat.x - 12, y: this.cat.y - 10, width: 24, height: 10 });
		this.services.ignoreInUi(this.blocker);
		this.services.invalidateNavigation();
	}
	private interact(id: string) {
		if (this.busy || this.services.dialogueBox.isActive()) return;
		const state = this.services.gameState;
		if (id === "butter") {
			if (state.hasIngredient("butter")) return this.say(PANINIS_LINES.empty);
			if (!state.flag("paniniMoved")) {
				// Saying hello is what unlocks the toys: the puzzle starts with the cat, not the props.
				state.setFlag("paniniMet");
				return this.say(PANINIS_LINES.guard);
			}
			state.addIngredient("butter"); // Persist before any reveal animation or scene exit.
			this.showEmptyCupboard();
			const cupboard = this.image("pn-ButterCupboard");
			this.say(PANINIS_LINES.taken, () => celebrateIngredient(
				{ scene: this.scene, journal: this.services.journal, frankie: this.services.frankie, pauseDuring: this.services.pauseDuring, ignoreInUi: o => this.services.ignoreInUi(o), hideFromWorldCamera: o => this.services.hideFromWorldCamera(o) },
				{ texture: "icon-butter", label: "Butter for Michell's cake", source: { x: cupboard.x + cupboard.width / 2, y: cupboard.y + cupboard.height - 6 }, giver: cupboard, color: INGREDIENT_COLORS.butter, ingredient: "butter", onDone: this.services.dialogueDone },
			));
			return;
		}
		if (state.flag("paniniMoved")) return this.say(PANINIS_LINES.settled);
		if (!state.flag("paniniMet")) return this.say(PANINIS_LINES.meetFirst);
		if (id === "toy" && state.flag("paniniToyTried")) return this.say(PANINIS_LINES.toyAgain);
		if (id === "basket" && state.flag("paniniBasketTried")) return this.say(PANINIS_LINES.basketAgain);
		if (id === "curtains" && (!state.flag("paniniToyTried") || !state.flag("paniniBasketTried"))) {
			return this.say(!state.flag("paniniToyTried") && !state.flag("paniniBasketTried") ? PANINIS_LINES.notTired
				: !state.flag("paniniToyTried") ? PANINIS_LINES.tryMouse : PANINIS_LINES.tryBasket);
		}
		const rest = id === "toy" ? 1 : id === "curtains" ? 2 : 3;
		this.say(PANINIS_LINES[id as "toy" | "curtains" | "basket"], () => {
			// For the mouse and the basket Frankie steps aside first, so the player can see what
			// Panini does with them instead of the back of his head.
			const aside = id === "toy" ? FRANKIE_ASIDE.toy : id === "basket" ? FRANKIE_ASIDE.basket : null;
			if (!aside) return this.moveCat(rest);
			this.busy = true;
			this.scene.physics.world.pause();
			const bodies = [...this.scene.physics.world.staticBodies] as Phaser.Physics.Arcade.StaticBody[];
			const size = { width: 28, height: 14 };
			const grid = buildGrid({ x: 0, y: 0, width: 608, height: 480 }, bodies, size, 4);
			const raw = findPath(grid, this.services.frankie, aside);
			const path = raw && smoothPath(this.services.frankie, raw, bodies, size);
			if (!path?.length || Math.hypot(path[path.length - 1].x - aside.x, path[path.length - 1].y - aside.y) > 4) {
				this.busy = false;
				this.services.dialogueDone();
				return;
			}
			const finish = () => {
				this.services.faceAndSpawn(aside.x, aside.y, aside.facing);
				(this.services.frankie.body as Phaser.Physics.Arcade.Body).reset(aside.x, aside.y);
				this.busy = false;
				this.moveCat(rest);
			};
			const step = () => {
				if (this.stopped) return;
				const next = path.shift();
				if (!next) return finish();
				walkSprite(this.scene, this.services.frankie, next, 70, step);
			};
			step();
		});
	}
	private sleep() {
		this.cat.stop().setTexture("panini-sleep-south").setOrigin(0.5, 0.85);
		const snooze = this.scene.add.text(this.cat.x + 16, this.cat.y - 32, "z z z", { fontFamily: "Nunito, sans-serif", fontSize: "12px", color: "#fff2ce", stroke: "#493629", strokeThickness: 2 }).setDepth(this.cat.y + 1);
		this.services.ignoreInUi(snooze);
		const y = snooze.y;
		let reduced = reducedMotion(this.scene);
		const tween = this.scene.tweens.add({ targets: snooze, y: y - 5, alpha: 0.35, duration: 1800, yoyo: true, repeat: -1, paused: reduced });
		const syncMotion = () => {
			const next = reducedMotion(this.scene);
			if (next === reduced) return;
			reduced = next;
			if (reduced) { tween.pause(); snooze.setY(y).setAlpha(1); }
			else tween.resume();
		};
		this.scene.events.on(Phaser.Scenes.Events.UPDATE, syncMotion);
		this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.events.off(Phaser.Scenes.Events.UPDATE, syncMotion));
	}
	private moveCat(rest: number, returningFrom?: number) {
		if (this.stopped) return;
		this.busy = true;
		this.scene.physics.world.pause();
		// The mouse stays where it is. While she visits it, it is drawn over her (her depth is her
		// feet, just south of it) so the batting is visible; back on the floor plane once she leaves.
		if (rest === 1) this.image("pn-MouseToy").setDepth(PANINI_REST[1].y + 1);
		if (returningFrom === 1) this.image("pn-MouseToy").setDepth(-1000);
		if (rest === 2) {
			this.services.gameState.setFlag("paniniCurtainsOpen");
			this.image("pn-CurtainsClosed").setTexture("pn-curtains-open");
			this.scene.tweens.add({ targets: this.beam, alpha: 1, duration: 650 });
			this.scene.events.emit("panini:curtains");
		}
		if (this.blocker) this.colliders.remove(this.blocker, true, true);
		this.blocker = null;
		const bodies = [...this.scene.physics.world.staticBodies] as Phaser.Physics.Arcade.StaticBody[];
		const grid = buildGrid({ x: 0, y: 0, width: 608, height: 480 }, bodies.map(b => ({ x: b.x, y: b.y, width: b.width, height: b.height })), { width: 24, height: 10 }, 4);
		const rawPath = findPath(grid, this.cat, PANINI_REST[rest]);
		const path = rawPath && smoothPath(this.cat, rawPath, bodies, { width: 24, height: 10 });
		if (!path) { this.rest = 0; this.cat.setPosition(PANINI_REST[0].x, PANINI_REST[0].y); this.placeBlocker(); this.busy = false; this.services.dialogueDone(); return; }
		const finish = () => {
			this.rest = rest;
			// Land exactly on the rest point: the smoothed path can stop a pixel or two short,
			// which is enough to sit her off the basket's cushion centre.
			this.cat.setPosition(PANINI_REST[rest].x, PANINI_REST[rest].y).setDepth(PANINI_REST[rest].y);
			this.cat.setOrigin(0.5, 0.85).play("panini-loaf-south");
			// Her arrivals get punctuation: a heart at the mouse or basket, a tick of sound.
			if (rest === 1 || rest === 3) emote(this.scene, this.cat, "heart", o => this.services.ignoreInUi(o), { offsetY: 30 });
			if (rest === 1 || rest === 3) reward.tick(this.scene, null, "ui-click", 1.2);
			if (rest === 1 || rest === 3) {
				// Give her time to bat the mouse or inspect the basket, then resume guarding.
				if (rest === 1) {
					const mouse = this.image("pn-MouseToy");
					this.scene.tweens.add({ targets: mouse, x: mouse.x + 3, duration: 160, yoyo: true, repeat: 3, onComplete: () => mouse.setX(128) });
				}
				this.scene.time.delayedCall(1400, () => this.moveCat(0, rest));
				return;
			}
			if (rest === 2) { this.cat.disableInteractive(); this.sleep(); }
			this.placeBlocker();
			const state = this.services.gameState;
			state.bump("paniniRest", rest - state.count("paniniRest"));
			if (rest === 2) state.setFlag("paniniMoved");
			if (returningFrom === 1) state.setFlag("paniniToyTried");
			if (returningFrom === 3) state.setFlag("paniniBasketTried");
			this.registerZones();
			this.busy = false;
			this.services.dialogueDone();
			if (rest === 2) getAudio(this.scene).sfx("pickup", { volume: 0.35 });
			this.say(rest === 2 ? PANINIS_LINES.asleep : returningFrom === 1 ? PANINIS_LINES.toyReturn : PANINIS_LINES.basketReturn);
		};
		const step = () => {
			if (this.stopped) return;
			const p = path.shift();
			if (!p) return finish();
			const dx = p.x - this.cat.x, dy = p.y - this.cat.y;
			const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "east" : "west") : (dy > 0 ? "south" : "north");
			const origins = { east: [0.4896, 0.8333], west: [0.5104, 0.8333], south: [0.5089, 0.8393], north: [0.5179, 0.8393] };
			this.cat.play(`panini-walking-${dir}`, true).setOrigin(origins[dir][0], origins[dir][1]);
			this.scene.tweens.add({ targets: this.cat, x: p.x, y: p.y, duration: Math.max(40, Math.hypot(dx, dy) / 65 * 1000), onUpdate: () => this.cat.setDepth(this.cat.y), onComplete: step });
		};
		step();
	}
}
