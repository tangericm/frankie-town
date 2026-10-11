import Phaser from "phaser";
import { getAudio } from "../audio";
import type { GameState } from "../GameState";
import { clearSavedState } from "../GameState";
import type { DialogueBox } from "../DialogueBox";
import { badgeAnchor, type InteractionManager } from "../InteractionManager";
import type { SceneTransition } from "../SceneTransition";
import type { JournalUI } from "../JournalUI";
import { celebrateIngredient, INGREDIENT_COLORS } from "../celebrate";
import { addNpcCollider } from "../npcCollider";
import { emote, reward, squash } from "../juice";
import {
	COOP_GOAL,
	GATE,
	GATE_ANIMATION,
	HEN_IDS,
	COOP_DEPTH,
	COOP_PASSAGE_BLOCKER,
	COOP_TEXTURE,
	COOP_WALL_BLOCKERS,
	MARKET_ARCH_FACE_BLOCKER,
	MARKET_ARCH_PASSAGE_BLOCKER,
	MARKET_EXIT_TO_STREET,
	MARKET_REWARDS,
	MARKET_SIDE_WALL_BLOCKERS,
	MARKET_SPAWN_FROM_STREET,
	MARKET_SYMBOLS,
	MEMORY_BASKET_STAND_BLOCKER,
	MEMORY_BOOTH_BLOCKER,
	MEMORY_LANE_TRIGGER,
	MEMORY_MAT_BLOCKERS,
	MEMORY_PANEL_DEPTH,
	MEMORY_PANEL_POSITIONS,
	MEMORY_PANEL_TEXTURES,
	PIERRE,
	PIERRE_ACTOR,
	PIERRE_DIALOGUE,
	SUGAR_CUBES,
	type MarketSymbol,
} from "../../data/market.gameplay";
import { pierreDialogue, pointInRect } from "./marketRules";
import { Herding } from "./Herding";
import { PigeonLane } from "./PigeonLane";
import { MemoryLane } from "./MemoryLane";
import { CartLane } from "./CartLane";
import { SugarPickup } from "./SugarPickup";
import { createLaneReset, type HazardLaneId } from "./laneReset";

export interface MarketSceneHost {
	faceAndSpawn(x: number, y: number, facing: "north" | "south" | "east" | "west"): void;
	getAuthoredImage(textureKey: string): Phaser.GameObjects.Image | null;
}

export interface MarketGameplayServices {
	gameState: GameState;
	dialogueBox: DialogueBox;
	interactions: InteractionManager;
	transition: SceneTransition;
	journal: JournalUI;
	pauseDuring(play: () => void): void;
	dialogueDone(): void;
	ignoreInUi(object: Phaser.GameObjects.GameObject): void;
	hideFromWorldCamera(object: Phaser.GameObjects.GameObject): void;
}

function sameBounds(a: Phaser.Geom.Rectangle, b: { x: number; y: number; width: number; height: number }) {
	return Math.abs(a.x - b.x) < 0.01
		&& Math.abs(a.y - b.y) < 0.01
		&& Math.abs(a.width - b.width) < 0.01
		&& Math.abs(a.height - b.height) < 0.01;
}

/** Pierre stands behind his counter, so his badge has to clear the stall's own canopy rather than
 * just his head. Shared by the always-on onboarding badge and the in-range one. */
const PIERRE_BADGE_OFFSET = 54;

export class MarketGameplay {
	private pierre: Phaser.GameObjects.Sprite;
	private coopImage: Phaser.GameObjects.Image | null = null;
	private pierreCollider: Phaser.GameObjects.Rectangle;
	private pierreOnboardBadge: Phaser.GameObjects.Image | null = null;
	private gate: Phaser.GameObjects.Sprite;
	private gateBlocker: Phaser.GameObjects.Rectangle | null = null;
	private herding: Herding;
	private pigeonLane: PigeonLane;
	private memoryLane: MemoryLane;
	private cartLane: CartLane;
	private sugarPickups: SugarPickup[] = [];
	private player: Phaser.GameObjects.Sprite;
	/** Which lanes have already given Frankie their setback line. Pierre's two authored setback
	 * lines (PIERRE_DIALOGUE.setbacks) explain what actually just killed you -- "wait for the gap,
	 * they always leave one" for the pigeons, "the cart retains right of way" for lane 3 -- and were
	 * written but never wired to anything. They play once per lane per visit: the first failure is
	 * where the explanation is worth reading, and every failure after that is a player who already
	 * knows and is mid-attempt. Deliberately not persisted, so a return visit re-teaches once rather
	 * than growing the save format for a hint.
	 */
	private setbacksShown = new Set<HazardLaneId>();
	private activated = false;
	private gateOpening = false;
	private gateUsable: boolean;
	private stopped = false;

	constructor(
		private scene: Phaser.Scene,
		host: MarketSceneHost,
		frankie: Phaser.GameObjects.Sprite,
		private worldColliders: Phaser.Physics.Arcade.StaticGroup,
		private services: MarketGameplayServices,
		spawnId: string | null,
	) {
		this.player = frankie;
		this.removeGeneratedBlocker(MARKET_ARCH_PASSAGE_BLOCKER);
		this.addStaticBlocker(MARKET_ARCH_FACE_BLOCKER);
		this.removeGeneratedBlocker(COOP_PASSAGE_BLOCKER);
		// The three memory-lane sign panels came out of the generic collider pipeline as solid, same
		// bug class as the two blockers just above -- Frankie could never actually stand near one.
		for (const bounds of Object.values(MEMORY_MAT_BLOCKERS)) this.removeGeneratedBlocker(bounds);
		// Same bug again for the basket stand itself -- Frankie couldn't get within interact range
		// of any basket.
		this.removeGeneratedBlocker(MEMORY_BASKET_STAND_BLOCKER);
		// Removing that whole-stand box left the stand with no collider at all -- Frankie could walk
		// straight through/behind the counter ("still clip through the memory booth"). This one covers
		// the counter's own measured solid mass instead (see MEMORY_BOOTH_BLOCKER).
		this.addStaticBlocker(MEMORY_BOOTH_BLOCKER);
		for (const bounds of COOP_WALL_BLOCKERS) this.addStaticBlocker(bounds);
		// Market.ts's depthSort() stamps the coop with its canvas bottom (667), 5px past where the
		// building is actually painted -- which silently beat henDepth's own floor and kept hens and
		// Frankie sorted behind the coop while standing at its front. Re-stamp it with the painted
		// bottom so the floor works (see COOP_DEPTH).
		this.coopImage = host.getAuthoredImage(COOP_TEXTURE)?.setDepth(COOP_DEPTH) ?? null;
		// The two side-wall stall backdrops are flat images with no collider of their own at all --
		// Frankie could walk straight through/behind them despite reading as solid stalls.
		for (const bounds of MARKET_SIDE_WALL_BLOCKERS) this.addStaticBlocker(bounds);
		if (spawnId === "fromStreet" || !spawnId) {
			host.faceAndSpawn(MARKET_SPAWN_FROM_STREET.x, MARKET_SPAWN_FROM_STREET.y, MARKET_SPAWN_FROM_STREET.facing);
		}
		services.transition.addDoor(MARKET_EXIT_TO_STREET, () => ({ x: frankie.x, y: frankie.y }));
		services.journal.show();

		this.pierre = this.createPierre();
		this.pierreOnboardBadge = services.gameState.hasMetPierre() ? null : this.createPierreOnboardBadge();
		this.pierreCollider = addNpcCollider(scene, frankie, {
			id: "pierre",
			x: PIERRE.x,
			y: PIERRE.y,
			width: PIERRE_ACTOR.collider.width,
			height: PIERRE_ACTOR.collider.height,
		});
		this.gateUsable = services.gameState.isMarketGateOpen();
		this.gate = this.createGate();
		this.herding = new Herding(scene, frankie, worldColliders, services.gameState, () => this.isGameplayUnlocked() && this.gateUsable, services.ignoreInUi, (count) => this.onHenHomed(count));
		const reset = createLaneReset(scene, frankie, host.faceAndSpawn.bind(host), (lane) => this.showSetback(lane), services.ignoreInUi);
		this.pigeonLane = new PigeonLane(
			scene,
			frankie,
			() => this.isGameplayUnlocked(),
			() => reset("lane1"),
			services.gameState.hasMarketSugarCube("lane1"),
		);
		const memoryPanels = {} as Record<MarketSymbol, Phaser.GameObjects.Image>;
		for (const symbol of MARKET_SYMBOLS) {
			const panel = host.getAuthoredImage(MEMORY_PANEL_TEXTURES[symbol]);
			if (!panel) throw new Error(`Missing authored Market memory panel ${symbol}`);
			// Frankie should always walk in front of these flat ground plaques, not get sorted
			// behind them by their own generated (bottom-edge) depth.
			panel.setDepth(MEMORY_PANEL_DEPTH);
			// Market.ts's editorCreate placed the three independently -- one landed a full lane away
			// from the other two, right at the south lane's own water edge ("align the rugs, the
			// feather is falling off the sidewalk"). Re-positioned into one row clear of both edges.
			const position = MEMORY_PANEL_POSITIONS[symbol];
			panel.setPosition(position.x, position.y);
			memoryPanels[symbol] = panel;
		}
		this.memoryLane = new MemoryLane(
			scene,
			worldColliders,
			services.interactions,
			() => this.isGameplayUnlocked() && !services.dialogueBox.isActive(),
			services.gameState.hasMarketSugarCube("lane2"),
			memoryPanels,
			services.ignoreInUi,
			services.gameState.isMarketMemorySolved(),
			() => services.gameState.markMarketMemorySolved(),
			() => pointInRect({ x: this.player.x, y: this.player.y }, MEMORY_LANE_TRIGGER),
		);
		this.cartLane = new CartLane(
			scene,
			frankie,
			() => this.isGameplayUnlocked(),
			() => reset("lane3"),
			services.gameState.hasMarketSugarCube("lane3"),
			services.ignoreInUi,
		);
		const laneClearers = {
			lane1: () => this.pigeonLane.clearPermanently(),
			lane2: () => this.memoryLane.clearPermanently(),
			lane3: () => this.cartLane.clearPermanently(),
		};
		for (const cube of SUGAR_CUBES) {
			const image = host.getAuthoredImage(cube.texture);
			if (!image) throw new Error(`Missing authored Market sugar cube ${cube.id}`);
			this.sugarPickups.push(new SugarPickup(
				scene,
				services.interactions,
				services.gameState,
				cube,
				image,
				() => this.isGameplayUnlocked() && (cube.id !== "lane2" || this.memoryLane.isRopeUsable()),
				laneClearers[cube.id],
				services.ignoreInUi,
				services.hideFromWorldCamera,
				(source) => celebrateIngredient(
					{ scene, journal: services.journal, frankie, pauseDuring: services.pauseDuring, ignoreInUi: services.ignoreInUi, hideFromWorldCamera: services.hideFromWorldCamera },
					{ texture: MARKET_REWARDS.sugar.texture, label: MARKET_REWARDS.sugar.label, source, color: INGREDIENT_COLORS.sugar, ingredient: MARKET_REWARDS.sugar.ingredient, onDone: services.dialogueDone },
				),
			));
		}
		if (import.meta.env.DEV) {
			Object.assign(scene as unknown as Record<string, unknown>, {
				__market: {
					snapshot: () => this.snapshot(),
					interactPierre: () => this.interactPierre(),
					openGate: () => this.openGate(),
					homeHen: (id: string) => this.herding.homeForDebug(id),
					completeMemory: () => this.memoryLane.completeForDebug(),
					enterMemory: (symbol: "feather" | "egg" | "apple") => this.memoryLane.enterForDebug(symbol),
					hitLane: (id: "lane1" | "lane3") => id === "lane1" ? this.pigeonLane.hitForDebug() : this.cartLane.hitForDebug(),
					collectCube: (id: "lane1" | "lane2" | "lane3") => this.sugarPickups.find((pickup) => pickup.debugState().id === id)?.collectForDebug(),
					resetSave: () => { clearSavedState(); location.reload(); },
				},
			});
		}

		const pierreTarget = scene.add.rectangle(430, 684, 88, 100, 0, 0).setOrigin(0).setDepth(784);
		services.ignoreInUi(pierreTarget);
		services.interactions.addZone({
			id: "pierre",
			x: PIERRE.x,
			y: PIERRE.y,
			radius: PIERRE.radius,
			indicatorOffset: PIERRE_BADGE_OFFSET,
			gameObject: pierreTarget,
			visualObject: this.pierre,
			marker: { x: PIERRE.x, y: 783, top: PIERRE.y - PIERRE_BADGE_OFFSET },
			onInteract: () => this.interactPierre(),
		});
		if (services.gameState.hasMetPierre()) this.activateGameplay();
	}

	/** Pierre's line for the lane that just caught Frankie, played once he is back on the checkpoint
	 * with control returned -- never over the black of the recovery fade. */
	private showSetback(lane: HazardLaneId) {
		if (this.stopped || this.setbacksShown.has(lane)) return;
		if (this.scene.data.get("hud:modal")) {
			// The scene clock is paused by the HUD; this runs after the last panel closes.
			this.scene.time.delayedCall(0, () => this.showSetback(lane));
			return;
		}
		if (!this.isGameplayUnlocked() || this.services.dialogueBox.isActive()) return;
		this.setbacksShown.add(lane);
		this.services.pauseDuring(() => this.services.dialogueBox.play([...PIERRE_DIALOGUE.setbacks[lane]], () => this.services.dialogueDone()));
	}

	isGameplayUnlocked() {
		return this.services.gameState.hasMetPierre();
	}

	isGateUsable() {
		return this.gateUsable;
	}

	/** A hen crossing the coop goal is a sub-goal: feathers at the door, the coop itself squashes,
	 * a "+1" pip, and the journal's hen line ticks over. The third hen is the bigger beat: a cream
	 * burst over the whole coop, "All home!", and Frankie's hop. (The hens themselves are hidden
	 * inside by then, so the coop stands in for them.) */
	private onHenHomed(count: number) {
		const coop = this.coopImage;
		const at = { x: COOP_GOAL.x + COOP_GOAL.width / 2, y: COOP_GOAL.y };
		if (coop?.scene) squash(this.scene, coop, 0.06, 120);
		const last = count >= HEN_IDS.length;
		reward.pop(this.scene, at, 0xfff4d6, this.services.ignoreInUi, { label: last ? "All home!" : `${count}/${HEN_IDS.length}`, shape: "feather", count: last ? 18 : 10, frankie: last ? this.player : null });
		if (last) emote(this.scene, this.player, "!", this.services.ignoreInUi);
	}

	private createPierre() {
		const key = `mkt-pierre-idle-${PIERRE_ACTOR.facing}`;
		if (!this.scene.anims.exists(key)) {
			this.scene.anims.create({
				key,
				frames: this.scene.anims.generateFrameNumbers(PIERRE_ACTOR.texture, {}),
				frameRate: PIERRE_ACTOR.frameRate,
				repeat: -1,
			});
		}
		return this.scene.add.sprite(PIERRE.x, PIERRE.y, PIERRE_ACTOR.texture, 0)
			.setOrigin(0.5, 1)
			.setDepth(PIERRE.y)
			.play(key);
	}

	/** Shown unconditionally (not gated by interact range, unlike InteractionManager's own badge)
	 * above Pierre until he's actually been talked to for the first time -- a new arrival standing
	 * across the square has no other cue there's an NPC to walk up to. */
	private createPierreOnboardBadge(): Phaser.GameObjects.Image | null {
		if (!this.scene.textures.exists("icon-interact")) return null;
		// Placed through badgeAnchor with the same indicatorOffset the "pierre" zone uses below, so
		// once Frankie is in range this badge and InteractionManager's own land on exactly the same
		// point instead of drawing as two offset speech bubbles.
		const anchor = badgeAnchor(PIERRE.x, PIERRE.y, PIERRE_BADGE_OFFSET);
		const badge = this.scene.add.image(anchor.x, anchor.y, "icon-interact").setDepth(9000);
		this.scene.tweens.add({ targets: badge, y: badge.y - 4, duration: 450, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
		return badge;
	}

	private createGate() {
		if (!this.scene.anims.exists(GATE_ANIMATION.key)) {
			this.scene.anims.create({
				key: GATE_ANIMATION.key,
				frames: this.scene.anims.generateFrameNumbers(GATE_ANIMATION.texture, { start: GATE_ANIMATION.startFrame, end: GATE_ANIMATION.openFrame }),
				frameRate: GATE_ANIMATION.frameRate,
				repeat: 0,
			});
		}
		// GATE.depth, not GATE.y -- the sprite's anchor sits 39px below the gate's own painted bottom
		// edge, and sorting by the anchor drew the gate over Frankie while she stood south of it.
		const gate = this.scene.add.sprite(GATE.x, GATE.y, GATE_ANIMATION.texture, this.gateUsable ? GATE_ANIMATION.openFrame : GATE_ANIMATION.closedFrame)
			.setOrigin(0.5, 1)
			.setDepth(GATE.depth);
		if (!this.gateUsable) this.gateBlocker = this.addStaticBlocker(GATE.blocker);
		return gate;
	}

	private interactPierre() {
		if (this.services.dialogueBox.isActive()) return;
		const state = this.services.gameState;
		const wasIntroduced = state.hasMetPierre();
		const shouldAwardEggs = wasIntroduced
			&& state.marketHensHomedCount() >= HEN_IDS.length
			&& !state.hasIngredient(MARKET_REWARDS.eggs.ingredient);
		const lines = pierreDialogue({
			introduced: wasIntroduced,
			hensHomed: state.marketHensHomedCount(),
			sugarCubes: state.marketSugarCubeCount(),
			hasEggs: state.hasIngredient(MARKET_REWARDS.eggs.ingredient),
			hasSugar: state.hasIngredient(MARKET_REWARDS.sugar.ingredient),
			cakeGiven: state.flag("cakeGiven"),
		});
		this.services.pauseDuring(() => this.services.dialogueBox.play([...lines], () => {
			if (!wasIntroduced) {
				state.markPierreMet();
				state.revealIngredient(MARKET_REWARDS.eggs.ingredient);
				state.revealIngredient(MARKET_REWARDS.sugar.ingredient);
				this.activateGameplay();
				this.pierreOnboardBadge?.destroy();
				this.pierreOnboardBadge = null;
			}
			if (shouldAwardEggs) {
				state.addIngredient(MARKET_REWARDS.eggs.ingredient);
				celebrateIngredient(
					{ scene: this.scene, journal: this.services.journal, frankie: this.player, pauseDuring: this.services.pauseDuring, ignoreInUi: this.services.ignoreInUi, hideFromWorldCamera: this.services.hideFromWorldCamera },
					{ texture: MARKET_REWARDS.eggs.texture, label: MARKET_REWARDS.eggs.label, source: { x: PIERRE.x, y: PIERRE.y - 24 }, giver: this.pierre, color: INGREDIENT_COLORS.eggs, ingredient: MARKET_REWARDS.eggs.ingredient, onDone: this.services.dialogueDone },
				);
				return;
			}
			this.services.dialogueDone();
		}));
	}

	private activateGameplay() {
		if (this.activated) return;
		this.activated = true;
		if (!this.services.gameState.isMarketGateOpen()) {
			this.services.interactions.addZone({
				id: "market-gate",
				kind: "object",
				action: "Open",
				x: GATE.x,
				y: GATE.y,
				radius: GATE.radius,
				indicatorOffset: 42,
				gameObject: this.gate,
				marker: { x: GATE.x, y: 787, top: 745 },
				onInteract: () => this.openGate(),
			});
		}
	}

	openGate() {
		if (!this.activated || this.gateOpening || this.gateUsable) return;
		this.gateOpening = true;
		this.services.gameState.openMarketGate();
		getAudio(this.scene).sfx("gate");
		this.services.interactions.removeZone("market-gate");
		const onFrame = (_animation: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame) => {
			if (Number(frame.textureFrame) >= GATE_ANIMATION.usableFrame) this.makeGateUsable();
		};
		this.gate.on(Phaser.Animations.Events.ANIMATION_UPDATE, onFrame);
		this.gate.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
			this.gate.off(Phaser.Animations.Events.ANIMATION_UPDATE, onFrame);
			this.makeGateUsable();
			this.gateOpening = false;
			this.gate.setFrame(GATE_ANIMATION.openFrame);
		});
		this.gate.play(GATE_ANIMATION.key);
	}

	private makeGateUsable() {
		if (this.gateUsable) return;
		this.gateUsable = true;
		if (this.gateBlocker) {
			this.worldColliders.remove(this.gateBlocker, true, true);
			this.gateBlocker = null;
		}
	}

	private addStaticBlocker(bounds: { x: number; y: number; width: number; height: number }) {
		const blocker = this.scene.add.rectangle(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, bounds.width, bounds.height).setVisible(false);
		this.scene.physics.add.existing(blocker, true);
		this.worldColliders.add(blocker);
		return blocker;
	}

	private removeGeneratedBlocker(bounds: { x: number; y: number; width: number; height: number }) {
		const child = this.worldColliders.getChildren().find((candidate) => {
			const object = candidate as Phaser.GameObjects.GameObject & { getBounds?: () => Phaser.Geom.Rectangle };
			return typeof object.getBounds === "function" && sameBounds(object.getBounds(), bounds);
		});
		if (child) this.worldColliders.remove(child, true, true);
	}

	get uiObjects() { return this.memoryLane.uiObjects; }

	update() {
		// The always-on onboarding badge and InteractionManager's in-range badge bob on different
		// phases, so with both drawn they read as two speech bubbles over Pierre's head the moment
		// Frankie walks up to him. Only one is ever shown: the onboarding one until he is in range,
		// the manager's own from then on.
		this.pierreOnboardBadge?.setVisible(this.services.interactions.nearestId() !== "pierre");
		this.herding.update();
		this.pigeonLane.update();
		this.memoryLane.update();
		this.cartLane.update();
		for (const pickup of this.sugarPickups) pickup.update();
	}

	private snapshot() {
		return {
			introduced: this.services.gameState.hasMetPierre(),
			gateOpen: this.services.gameState.isMarketGateOpen(),
			hensHomed: this.services.gameState.marketHensHomedCount(),
			hens: this.herding.debugState(),
			cubes: this.sugarPickups.map((pickup) => pickup.debugState()),
			laneStates: {
				lane1: this.pigeonLane.debugState(),
				lane2: this.memoryLane.debugState(),
				lane3: this.cartLane.debugState(),
			},
			player: { x: this.player.x, y: this.player.y },
		};
	}

	stop() {
		if (this.stopped) return;
		this.stopped = true;
		this.services.interactions.removeZone("pierre");
		this.services.interactions.removeZone("market-gate");
		this.herding.stop();
		this.pigeonLane.stop();
		this.memoryLane.stop();
		this.cartLane.stop();
		for (const pickup of this.sugarPickups) pickup.stop();
		this.sugarPickups = [];
		if (import.meta.env.DEV) delete (this.scene as unknown as Record<string, unknown>).__market;
		// StaticGroup has already begun its own shutdown by the time the scene SHUTDOWN callback
		// runs. Its children are scene-owned and will be destroyed automatically; asking the dead
		// group to remove them here throws during scene restart.
		this.gateBlocker = null;
		this.gate.destroy();
		this.pierreOnboardBadge?.destroy();
		this.pierreCollider.destroy();
		this.pierre.destroy();
	}
}
