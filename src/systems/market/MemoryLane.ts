import Phaser from "phaser";
import type { InteractionManager } from "../InteractionManager";
import {
	LANE2,
	MARKET_SYMBOLS,
	MEMORY_BASKET_DEPTH,
	MEMORY_BASKET_TUNING,
	MEMORY_BASKETS,
	MEMORY_GLOW,
	MEMORY_PANEL_DEPTH,
	MEMORY_ROUND_LABELS,
	MEMORY_ROUNDS,
	MEMORY_STATUS,
	MEMORY_TIMING,
	ROPE_ANIMATION,
	type MarketSymbol,
} from "../../data/market.gameplay";
import { enterMemorySymbol, type MemoryAttempt } from "./marketRules";
import { getAudio } from "../audio";
import { burst, hop, ring, shake, reducedMotion } from "../juice";
import { findImageByTexture } from "../propThoughts";

import { makeButton, type ButtonHandle } from "../panel";
import { PALETTE } from "../palette";
import { getTextScale, TEXT_SCALE_CHANGED } from "../textScale";

const SYMBOL_COLORS: Record<MarketSymbol, number> = {
	feather: 0x86c7d6,
	egg: 0xf5e4b8,
	apple: 0xd9664f,
};
const INCORRECT_COLOR = 0xc85b4d;
// The same quiet note identifies a symbol while watching and answering.
const SYMBOL_PITCH: Record<MarketSymbol, number> = { feather: 0.92, egg: 1, apple: 1.12 };

/**
 * The memory-lane minigame: the three sign panels (feather/egg/apple) light up in sequence, then
 * Frankie presses E at the matching basket on the room's own 3-basket stand, in that order. The
 * signs are pure display -- Frankie never steps on or collides with them. All sequence/attempt
 * logic lives in marketRules.ts's enterMemorySymbol, unchanged by this input swap.
 */
export class MemoryLane {
	private rope: Phaser.GameObjects.Sprite;
	private ropeBlocker: Phaser.GameObjects.Rectangle | null = null;
	/** The lit halo behind each sign panel -- the round's "look here" presentation cue. */
	private matGlows = new Map<MarketSymbol, Phaser.GameObjects.Rectangle>();
	/** Small indicator at each basket on the stand -- input feedback only (correct/incorrect
	 * flash), not a presentation cue. */
	private baskets = new Map<MarketSymbol, Phaser.GameObjects.Arc>();
	/** "Round 1/3 - WATCH" above the stand: which phase the minigame is in. */
	private status: Phaser.GameObjects.Text;
	/** The progress row under that line -- one circle per symbol in the round, filled in as Frankie
	 * enters them. Real circles rather than the glyphs the label line used to carry, because Phaser
	 * Text has no per-character colour and an entered pip therefore could not be green while the
	 * basket it echoed was (see MEMORY_STATUS.pip). Rebuilt whenever the round's length changes;
	 * MEMORY_ROUNDS is at most 5 long. */
	private pips: Phaser.GameObjects.Arc[] = [];
	/** How many pips were already filled last refresh, so only newly-entered ones pop. */
	private pipsFilled = 0;
	private timers: Phaser.Time.TimerEvent[] = [];
	private attempt: MemoryAttempt = { round: 0, cursor: 0, complete: false };
	private started = false;
	private accepting = false;
	/** True only while a pattern is actually being shown. `accepting` is false both then AND in the
	 * pause between rounds, so it cannot tell the two apart -- and the "an early press cuts the
	 * presentation short" shortcut in interactBasket fired in the pause too, cancelling the *next*
	 * round's scheduled presentation. That dropped the player into a round they were never shown. */
	private presenting = false;
	/** Held separately from the rest of `timers` so an accepted press can re-arm just this one. */
	private idleTimer: Phaser.Time.TimerEvent | null = null;
	/** The puzzle itself is finished. Distinct from `cleared` (the lane-2 sugar cube has been picked
	 * up): the win used to be recorded ONLY by that pickup, so walking out of the market -- or
	 * reloading -- after solving it but before grabbing the cube closed the rope and re-armed all
	 * three rounds, silently throwing the solve away. */
	private solved: boolean;
	private ropeUsable: boolean;
	private cleared: boolean;
	private stopped = false;
	readonly uiObjects: Phaser.GameObjects.GameObject[] = [];
	private help = false;
	private controls: ButtonHandle[] = [];
	private objectivePill?: Phaser.GameObjects.Container;
	private focused = -1;
	private instruction!: Phaser.GameObjects.Text;
	private layoutControls = () => {
		const [replay, help] = this.controls;
		const scale = getTextScale(this.scene.game);
		replay?.setPosition(this.scene.scale.width / 2 - 102, this.scene.scale.height - 58);
		help?.setPosition(this.scene.scale.width / 2 + 6, this.scene.scale.height - 58);
		this.instruction?.setFontSize(14 * scale).setWordWrapWidth(this.scene.scale.width - 32).setPosition(this.scene.scale.width / 2, this.scene.scale.height - 70 - this.instruction.height / 2);
		if (!this.status) return;
		this.status.setFontSize(13 * scale);
		this.positionStatus();
	};
	private positionStatus = () => {
		const cam = this.scene.cameras.main, view = cam.worldView;
		const wrapWidth = Math.min(260, (this.scene.scale.width - 32) / cam.zoom);
		if (this.status.style.wordWrapWidth !== wrapWidth) this.status.setWordWrapWidth(wrapWidth);
		const left = view.left + this.status.width / 2 + 12 / cam.zoom;
		let x = Phaser.Math.Clamp(MEMORY_STATUS.x, left, view.right - this.status.width / 2 - 12 / cam.zoom);
		let y = Phaser.Math.Clamp(MEMORY_STATUS.y + 8 - this.status.height / 2, view.top + this.status.height / 2 + 12 / cam.zoom, view.bottom - this.status.height / 2 - 12 / cam.zoom);
		const pill = this.objectivePill?.visible ? this.objectivePill.getBounds() : null;
		if (pill && (y - this.status.height / 2 - view.top) * cam.zoom < pill.bottom + 8 && (y + this.status.height / 2 - view.top) * cam.zoom > pill.top - 8 && (x + this.status.width / 2 - view.left) * cam.zoom > pill.left - 8) {
			const clearRight = view.left + (pill.left - 8) / cam.zoom - this.status.width / 2;
			if (clearRight >= left) x = Math.min(x, clearRight);
			else y = Math.max(y, view.top + (pill.bottom + 8) / cam.zoom + this.status.height / 2);
		}
		this.status.setPosition(x, y);
		this.pips.forEach((dot, i) => dot.setPosition(this.status.x + (i - (this.pips.length - 1) / 2) * MEMORY_STATUS.pip.spacing, this.status.y + this.status.height / 2 + 7));
	};
	private onKey = (event: KeyboardEvent) => {
		if (!this.started || this.solved || this.stopped || this.scene.physics.world.isPaused || !this.enabled()) return;
		if (event.code === "Tab" || (this.focused >= 0 && event.code.startsWith("Arrow"))) {
			if (!event.repeat) {
				const back = event.shiftKey || event.code === "ArrowLeft" || event.code === "ArrowUp";
				this.focused = this.focused < 0 ? (back ? this.controls.length - 1 : 0) : (this.focused + (back ? -1 : 1) + this.controls.length) % this.controls.length;
				this.controls.forEach((button, i) => button.setFocused(i === this.focused));
			}
		} else if (event.code === "Enter" && this.focused >= 0) { if (!event.repeat) this.controls[this.focused]?.activate(); }
		else if (event.code === "Escape" && this.focused >= 0) {
			this.focused = -1;
			this.controls.forEach(button => button.setFocused(false));
		} else return;
		event.preventDefault();
		event.stopPropagation();
		this.scene.input.keyboard?.addKey(event.keyCode).reset();
	};

	constructor(
		private scene: Phaser.Scene,
		private worldColliders: Phaser.Physics.Arcade.StaticGroup,
		private interactions: InteractionManager,
		private enabled: () => boolean,
		cleared: boolean,
		private panels: Record<MarketSymbol, Phaser.GameObjects.Image>,
		private onWorldObjectCreated: (object: Phaser.GameObjects.GameObject) => void = () => {},
		solved = cleared,
		private onSolved: () => void = () => {},
		/** Is Frankie standing in MEMORY_LANE_TRIGGER right now? The booth waits for him. */
		private playerInLane: () => boolean = () => true,
	) {
		this.cleared = cleared;
		this.solved = solved || cleared;
		this.ropeUsable = this.solved;
		this.objectivePill = scene.children.list.find(o => o.type === "Container" && (o as Phaser.GameObjects.Container).depth === 9501 && (o as Phaser.GameObjects.Container).list.some(child => child.type === "Text")) as Phaser.GameObjects.Container | undefined;
		if (!this.solved) {
			const replay = makeButton(scene, 0, 0, "Replay", () => {
				if (scene.physics.world.isPaused || !this.started || this.ropeUsable) return;
				this.cancelTimers(); this.presentRound();
			}, { width: 96, height: 44 });
			const help = makeButton(scene, 0, 0, "Help", () => {
				if (scene.physics.world.isPaused || !this.started || this.ropeUsable) return;
				this.help = !this.help; help.setSelected(this.help); this.refreshStatus();
			}, { width: 96, height: 44 });
			this.controls = [replay, help];
			this.instruction = scene.add.text(0, 0, "", { fontFamily: "Nunito, sans-serif", fontSize: "14px", color: PALETTE.css.panelLight, align: "center", stroke: PALETTE.css.shadow, strokeThickness: 4 }).setOrigin(0.5);
			this.uiObjects.push(replay, help, this.instruction);
			for (const object of this.uiObjects) (object as Phaser.GameObjects.Container).setScrollFactor(0, 0, true).setDepth(9400).setVisible(false);
			this.layoutControls();
			scene.scale.on(Phaser.Scale.Events.RESIZE, this.layoutControls);
			scene.game.registry.events.on(TEXT_SCALE_CHANGED, this.layoutControls);
			scene.input.keyboard?.on("keydown", this.onKey);
		}
		if (!scene.anims.exists(ROPE_ANIMATION.key)) {
			scene.anims.create({
				key: ROPE_ANIMATION.key,
				frames: scene.anims.generateFrameNumbers(ROPE_ANIMATION.texture, { start: ROPE_ANIMATION.startFrame, end: ROPE_ANIMATION.openFrame }),
				frameRate: ROPE_ANIMATION.frameRate,
				repeat: 0,
			});
		}
		this.rope = scene.add.sprite(LANE2.rope.x, LANE2.rope.y, ROPE_ANIMATION.texture, this.solved ? ROPE_ANIMATION.openFrame : ROPE_ANIMATION.closedFrame)
			.setOrigin(0.5, 1)
			.setDepth(LANE2.rope.y);
		if (!this.solved) this.ropeBlocker = this.addBlocker();
		this.status = scene.add.text(MEMORY_STATUS.x, MEMORY_STATUS.y, "", {
			fontFamily: '"Pixelify Sans", monospace',
			fontSize: "13px",
			color: "#fff4d6",
			stroke: "#493329",
			strokeThickness: 4,
			align: "center",
		}).setOrigin(0.5).setDepth(MEMORY_STATUS.depth).setVisible(false);
		onWorldObjectCreated(this.status);
		this.layoutControls();
		for (const symbol of MARKET_SYMBOLS) {
			const panel = panels[symbol];
			// A halo in the panel's own symbol colour, additively blended, sitting just under it: the
			// blue feather rug lights up blue, the red apple rug red. This replaces a
			// Phaser.Filters.Glow traced on the panel art, which was configured, alive and reporting
			// its own outerStrength every frame -- and rendered nothing visible at this sprite size,
			// so the only cue a player actually got was the panel's scale pop. Additive blend rather
			// than a flat fill so it reads as light on the brick instead of a coloured card behind
			// the rug.
			const glow = scene.add
				.rectangle(panel.x + panel.displayWidth / 2, panel.y + panel.displayHeight / 2, panel.displayWidth + MEMORY_GLOW.padding * 2, panel.displayHeight + MEMORY_GLOW.padding * 2, SYMBOL_COLORS[symbol], MEMORY_GLOW.restAlpha)
				.setBlendMode(Phaser.BlendModes.ADD)
				.setDepth(MEMORY_PANEL_DEPTH - 1);
			this.matGlows.set(symbol, glow);
			onWorldObjectCreated(glow);

			// Once the puzzle is solved the baskets are scenery. Building them anyway left three live
			// interact zones and three lit markers at a finished booth after a reload -- the "!" badge
			// floating over a basket that does nothing when pressed. (clearPermanently() removes them
			// in the same-session path, but early-returns when the scene was rebuilt already cleared.)
			if (this.solved) continue;

			const basket = MEMORY_BASKETS[symbol];
			// MEMORY_BASKET_DEPTH, not the basket's own y -- the stand image is depth-sorted at 353 and
			// would otherwise hide every marker completely (see MEMORY_BASKET_DEPTH).
			const basketDot = scene.add.circle(basket.x, basket.y, MEMORY_BASKET_TUNING.radius, SYMBOL_COLORS[symbol], MEMORY_BASKET_TUNING.restAlpha)
				.setStrokeStyle(2, 0xfff7cf, 0.9)
				.setDepth(MEMORY_BASKET_DEPTH);
			this.baskets.set(symbol, basketDot);
			onWorldObjectCreated(basketDot);

			this.interactions.addZone({
				id: `market-memory-basket-${symbol}`,
				kind: "object",
				action: "Choose",
				x: basket.x,
				y: basket.y,
				radius: MEMORY_BASKET_TUNING.interactRadius,
				// The marker is elevated; its authored counter footprint ends at y353.
				reachBounds: { x: basket.x - 9, y: basket.y, width: 18, height: 25 },
				indicatorOffset: MEMORY_BASKET_TUNING.indicatorOffset,
				gameObject: basketDot,
				onInteract: () => this.interactBasket(symbol),
			});
		}
	}

	update() {
		if (!this.stopped) this.positionStatus();
		if (this.stopped || this.solved || !this.enabled()) return;
		const inLane = this.playerInLane();
		if (!this.started) {
			// The round starts when Frankie walks into the lane, not when Pierre finishes talking
			// (see MEMORY_LANE_TRIGGER) -- otherwise the booth plays its sequence to an empty room
			// and he arrives halfway through one.
			if (!inLane) return;
			this.started = true;
			this.refreshStatus();
			this.schedule(MEMORY_TIMING.startDelayMs, () => this.presentRound());
			return;
		}
		if (!inLane) this.suspend();
	}

	/** Frankie has walked back out of the lane. Stop presenting to nobody and put the round back to
	 * its first symbol, so returning replays it from the top instead of resuming mid-sequence --
	 * the same reasoning as the idle replay, for the same reason. Which round he is on is kept: he
	 * has already earned that, and walking away is not a wrong answer. */
	private suspend() {
		this.cancelTimers();
		this.resetMats();
		this.resetBaskets();
		this.started = false;
		this.focused = -1;
		this.controls.forEach(button => button.setFocused(false));
		this.presenting = false;
		this.accepting = false;
		this.attempt = { ...this.attempt, cursor: 0 };
		this.refreshStatus();
	}

	/** The one place the minigame says what it is doing. Called on every phase change and every
	 * accepted press, so "watch" vs "your turn" and the progress pips can never drift out of sync
	 * with `accepting`/`attempt`. */
	private refreshStatus() {
		if (this.solved || this.stopped || !this.started) {
			this.status.setVisible(false);
			this.uiObjects.forEach(o => (o as Phaser.GameObjects.Container).setVisible(false));
			this.hidePips();
			return;
		}
		const sequence = MEMORY_ROUNDS[this.attempt.round] ?? [];
		this.uiObjects.forEach(o => (o as Phaser.GameObjects.Container).setVisible(true));
		this.instruction?.setText((this.help ? sequence.join(" → ") : "Watch the order, then choose the matching baskets.") + (this.scene.sys.game.device.input.touch ? "" : "\nTab: controls · Enter: choose · Esc: back"));
		const phase = this.accepting ? MEMORY_STATUS.yourTurn : MEMORY_STATUS.watch;
		this.status.setText(`${MEMORY_ROUND_LABELS[this.attempt.round]}  ${phase}`).setVisible(true);
		this.layoutControls();
		this.refreshPips(sequence.length, this.attempt.cursor);
		// The baskets are only live in the "your turn" half, so they say so: dim while the pattern
		// plays, bright once it is Frankie's move.
		for (const symbol of MARKET_SYMBOLS) {
			const basket = this.baskets.get(symbol);
			if (basket && !this.scene.tweens.isTweening(basket)) {
				basket.setAlpha(this.accepting ? 1 : MEMORY_BASKET_TUNING.waitingAlpha);
			}
		}
	}

	/** Lays out `count` pips centred on MEMORY_STATUS.x and colours the first `filled` of them the
	 * baskets' own success green. A pip that has just been filled pops, so an accepted press is
	 * confirmed in both places at once -- on the basket you pressed and on the row you are reading. */
	private refreshPips(count: number, filled: number) {
		const pip = MEMORY_STATUS.pip;
		if (this.pips.length !== count) this.buildPips(count);
		for (const [index, dot] of this.pips.entries()) {
			const done = index < filled;
			const justFilled = done && index >= this.pipsFilled;
			dot.setVisible(true).setFillStyle(done ? pip.doneColor : pip.todoColor, done ? 1 : pip.todoAlpha);
			if (!justFilled || reducedMotion(this.scene)) continue;
			this.scene.tweens.killTweensOf(dot);
			this.scene.tweens.add({ targets: dot, scale: pip.popScale, duration: pip.popMs, yoyo: true, ease: "Back.easeOut" });
		}
		this.pipsFilled = filled;
	}

	private buildPips(count: number) {
		for (const dot of this.pips) dot.destroy();
		this.pips = [];
		const pip = MEMORY_STATUS.pip;
		// Centred as a row: the label above it is drawn from its own centre at the same x, so an
		// odd- and an even-length round both stay under it instead of drifting right.
		const left = MEMORY_STATUS.x - (count - 1) * pip.spacing / 2;
		for (let index = 0; index < count; index += 1) {
			const dot = this.scene.add
				.circle(left + index * pip.spacing, MEMORY_STATUS.y + pip.offsetY, pip.radius, pip.todoColor, pip.todoAlpha)
				.setStrokeStyle(pip.strokeWidth, pip.strokeColor, pip.strokeAlpha)
				.setDepth(MEMORY_STATUS.depth);
			this.onWorldObjectCreated(dot);
			this.pips.push(dot);
		}
		this.pipsFilled = 0;
	}

	private hidePips() {
		for (const dot of this.pips) dot.setVisible(false);
	}

	isRopeUsable() {
		return this.ropeUsable;
	}

	private interactBasket(symbol: MarketSymbol) {
		// `ropeUsable` as well as `solved`: between dropping the rope and picking up the cube the
		// zones are still live, and pressing again ran the whole completion path a second time --
		// the rope visibly wound back up and dropped again, repeatable indefinitely.
		if (this.solved || this.ropeUsable || this.stopped || !this.started) return;
		// A press in the pause between rounds (neither presenting nor accepting) is ignored.
		if (!this.accepting && !this.presenting) return;
		if (!this.accepting) {
			// A press during the demonstration cuts it short AND counts as the first answer. It used
			// to only stop the watch phase, so the player who already knew the pattern pressed the
			// first basket, saw nothing register, and had to press it again ("pressing the first
			// time stops the watch, but it needs to be pressed again to count").
			this.cancelTimers();
			this.resetMats();
			this.presenting = false;
			this.accepting = true;
			this.attempt = { ...this.attempt, cursor: 0 };
			this.resetBaskets();
		}
		this.scheduleIdleReplay();
		this.enter(symbol);
		this.refreshStatus();
	}

	private presentRound() {
		if (this.stopped || this.solved) return;
		this.accepting = false;
		this.presenting = true;
		// A replay shows the round from its first symbol, so the answer has to start from the first
		// symbol too. Without this the idle replay left the cursor mid-sequence: the player watched
		// the pattern from the top, pressed the first symbol back, and was marked wrong.
		this.attempt = { ...this.attempt, cursor: 0 };
		this.resetMats();
		this.resetBaskets();
		this.refreshStatus();
		const sequence = MEMORY_ROUNDS[this.attempt.round];
		let elapsed = 0;
		for (const symbol of sequence) {
			this.schedule(elapsed, () => {
				this.setMatLit(symbol, true);
				getAudio(this.scene).sfx("journal-tick", { volume: 0.35, rate: SYMBOL_PITCH[symbol] });
			});
			elapsed += MEMORY_TIMING.litMs;
			this.schedule(elapsed, () => this.setMatLit(symbol, false));
			elapsed += MEMORY_TIMING.darkMs;
		}
		this.schedule(elapsed, () => {
			this.presenting = false;
			this.accepting = true;
			this.refreshStatus();
			this.scheduleIdleReplay();
		});
	}

	/** Replays the round's pattern if Frankie hasn't pressed a basket in a while -- otherwise a player
	 * who missed it is left with no way to see it again short of failing a guess on purpose. Guarded
	 * on `accepting` still being true (not reset by an in-between press) so nobody gets cut off
	 * mid-sequence.
	 *
	 * Re-armed on every accepted press, not just once when the presentation ends: round 3 is five
	 * symbols with a walk between baskets for each, so taking longer than idleReplayMs to enter a
	 * whole sequence is normal play, and the replay used to fire in the middle of one. */
	private scheduleIdleReplay() {
		this.idleTimer?.remove();
		this.idleTimer = this.schedule(MEMORY_TIMING.idleReplayMs, () => {
			this.idleTimer = null;
			if (this.accepting) this.presentRound();
		});
	}

	private enter(symbol: MarketSymbol) {
		const result = enterMemorySymbol(this.attempt, symbol);
		this.attempt = result.attempt;
		const at = MEMORY_BASKETS[symbol];
		if (result.status !== "replay") getAudio(this.scene).sfx("journal-tick", { volume: 0.45, rate: SYMBOL_PITCH[symbol] });
		if (result.status === "accepted") {
			this.flashBasketCorrect(symbol);
			// The ring is the success green, never the symbol's own colour: the apple's red ring at
			// the end of a correct sequence read as a wrong answer.
			ring(this.scene, at.x, at.y, MEMORY_BASKET_TUNING.correctColor, this.onWorldObjectCreated, { radius: 9, depth: MEMORY_BASKET_DEPTH - 1 });
			return;
		}
		this.accepting = false;
		if (result.status === "replay") {
			this.flashBasketsIncorrect();
			getAudio(this.scene).sfx("setback", { volume: 0.5 });
			const stand = findImageByTexture(this.scene, "mkt-8afaf6af");
			if (stand && !reducedMotion(this.scene)) shake(this.scene, stand, 3, 240);
			this.schedule(MEMORY_TIMING.incorrectMs, () => this.presentRound());
			return;
		}
		if (result.status === "round-complete") {
			this.flashBasketCorrect(symbol);
			this.showRoundLabel(this.attempt.round);
			this.lightWave();
			burst(this.scene, MEMORY_BASKETS.egg.x, MEMORY_BASKETS.egg.y, 0xfff1a8, this.onWorldObjectCreated, { count: 12, depth: MEMORY_BASKET_DEPTH - 1 });
			this.schedule(MEMORY_TIMING.roundCompleteMs, () => this.presentRound());
			return;
		}
		this.flashBasketCorrect(symbol);
		this.lightWave();
		burst(this.scene, MEMORY_BASKETS.egg.x, MEMORY_BASKETS.egg.y, 0xfff1a8, this.onWorldObjectCreated, { count: 18, speed: { min: 60, max: 160 }, depth: MEMORY_BASKET_DEPTH - 1 });
		const frankie = (this.scene as unknown as { frankie?: Phaser.GameObjects.Sprite }).frankie;
		if (frankie) hop(this.scene, frankie, this.onWorldObjectCreated);
		this.dropRope();
	}

	/** The three sign panels light left to right in a quick wave: the round's own little fanfare.
	 * The baskets echo it in the success green rather than their symbol colours, so the red apple
	 * basket never lights up red at the moment the player got everything right. */
	private lightWave() {
		MARKET_SYMBOLS.forEach((symbol, index) => {
			this.schedule(index * 90, () => {
				this.setMatLit(symbol, true);
				this.baskets.get(symbol)?.setFillStyle(MEMORY_BASKET_TUNING.correctColor, MEMORY_BASKET_TUNING.correctAlpha);
			});
			this.schedule(index * 90 + 260, () => {
				this.setMatLit(symbol, false);
				this.setBasketRest(symbol);
			});
		});
	}

	/** Bright pop + scale on the pressed basket -- confirms "yes, that one, correctly." */
	private flashBasketCorrect(symbol: MarketSymbol) {
		const basket = this.baskets.get(symbol);
		if (!basket) return;
		this.scene.tweens.killTweensOf(basket);
		basket.setFillStyle(MEMORY_BASKET_TUNING.correctColor, MEMORY_BASKET_TUNING.correctAlpha);
		this.scene.tweens.add({
			targets: basket,
			scale: reducedMotion(this.scene) ? 1 : MEMORY_BASKET_TUNING.correctScale,
			duration: 100,
			yoyo: true,
			ease: "Back.easeOut",
			onComplete: () => this.setBasketRest(symbol),
		});
	}

	/** All three baskets flash red -- confirms "no, wrong one" without singling out which one the
	 * player actually meant to press. */
	private flashBasketsIncorrect() {
		for (const symbol of MARKET_SYMBOLS) {
			const basket = this.baskets.get(symbol);
			if (!basket) continue;
			this.scene.tweens.killTweensOf(basket);
			basket.setFillStyle(INCORRECT_COLOR, MEMORY_BASKET_TUNING.incorrectAlpha);
		}
	}

	private showRoundLabel(round: number) {
		const label = this.scene.add.text(MEMORY_BASKETS.egg.x, MEMORY_BASKETS.egg.y - 30, MEMORY_ROUND_LABELS[round], {
			fontFamily: '"Pixelify Sans", monospace',
			fontSize: "14px",
			color: "#fff4d6",
			stroke: "#493329",
			strokeThickness: 3,
		}).setOrigin(0.5).setDepth(9000);
		this.onWorldObjectCreated(label);
		this.scene.tweens.add({ targets: label, ...(!reducedMotion(this.scene) ? { y: label.y - 8 } : {}), alpha: 0, duration: MEMORY_TIMING.roundCompleteMs, onComplete: () => label.destroy() });
	}

	private dropRope() {
		this.accepting = false;
		const onFrame = (_animation: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame) => {
			if (Number(frame.textureFrame) >= ROPE_ANIMATION.usableFrame) this.makeRopeUsable();
		};
		this.rope.on(Phaser.Animations.Events.ANIMATION_UPDATE, onFrame);
		this.rope.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
			this.rope.off(Phaser.Animations.Events.ANIMATION_UPDATE, onFrame);
			this.makeRopeUsable();
			this.rope.setFrame(ROPE_ANIMATION.openFrame);
		});
		this.rope.play(ROPE_ANIMATION.key);
	}

	private makeRopeUsable() {
		if (this.ropeUsable) return;
		this.ropeUsable = true;
		this.solved = true;
		this.cancelTimers();
		this.resetMats();
		for (const symbol of MARKET_SYMBOLS) {
			this.interactions.removeZone(`market-memory-basket-${symbol}`);
			const basket = this.baskets.get(symbol);
			if (basket) { this.scene.tweens.killTweensOf(basket); basket.setVisible(false); }
		}
		this.presenting = false;
		this.accepting = false;
		this.status.setVisible(false);
		this.uiObjects.forEach(o => (o as Phaser.GameObjects.Container).setVisible(false));
		this.hidePips();
		this.onSolved();
		if (this.ropeBlocker) {
			this.worldColliders.remove(this.ropeBlocker, true, true);
			this.ropeBlocker = null;
		}
	}

	clearPermanently() {
		if (this.cleared) return;
		this.cleared = true;
		this.accepting = false;
		this.cancelTimers();
		this.makeRopeUsable();
		this.rope.stop().setFrame(ROPE_ANIMATION.openFrame);
		this.resetMats();
		for (const symbol of MARKET_SYMBOLS) {
			this.interactions.removeZone(`market-memory-basket-${symbol}`);
			this.baskets.get(symbol)?.setVisible(false);
		}
		this.status.setVisible(false);
		this.uiObjects.forEach(o => (o as Phaser.GameObjects.Container).setVisible(false));
		this.hidePips();
	}

	completeForDebug() {
		if (this.cleared || this.ropeUsable) return;
		this.cancelTimers();
		this.attempt = { round: MEMORY_ROUNDS.length - 1, cursor: MEMORY_ROUNDS[MEMORY_ROUNDS.length - 1].length, complete: true };
		this.dropRope();
	}

	enterForDebug(symbol: MarketSymbol) {
		if (this.cleared || this.ropeUsable) return;
		this.cancelTimers();
		this.started = true;
		this.accepting = true;
		this.enter(symbol);
		// The real input path (interactBasket) always refreshes afterwards; without this the debug
		// path advanced the attempt while the readout above the booth still showed the old pips,
		// which made the readout untestable from a harness.
		this.refreshStatus();
	}

	debugState() {
		return { ...this.attempt, presenting: this.started && !this.accepting && !this.ropeUsable, ropeUsable: this.ropeUsable, cleared: this.cleared };
	}

	/** `lit` raises the panel's own coloured halo, pops its scale, AND echoes the same beat on the
	 * matching basket marker.
	 *
	 * The echo is the important half. The rugs are a row 160px wide sitting beside a 130px-wide
	 * stall, and Frankie has to stand at the stall to answer -- on a phone that puts the far rug off
	 * the edge of the screen, so the pattern was being played somewhere the player could not fully
	 * see while standing where they had to stand. Lighting the basket too means the sequence is
	 * always readable from the one spot the minigame requires. */
	private setMatLit(symbol: MarketSymbol, lit: boolean) {
		const glow = this.matGlows.get(symbol);
		const panel = this.panels[symbol];
		if (!glow || !panel) return;
		this.scene.tweens.killTweensOf([glow, panel]);
		this.scene.tweens.add({ targets: glow, alpha: lit ? MEMORY_GLOW.litAlpha : MEMORY_GLOW.restAlpha, scale: lit && !reducedMotion(this.scene) ? MEMORY_GLOW.litScale : 1, duration: 120 });
		this.scene.tweens.add({ targets: panel, scale: lit && !reducedMotion(this.scene) ? 1.08 : 1, duration: 120, ease: "Back.easeOut" });

		const basket = this.baskets.get(symbol);
		if (!basket) return;
		this.scene.tweens.killTweensOf(basket);
		basket.setFillStyle(SYMBOL_COLORS[symbol], lit ? MEMORY_BASKET_TUNING.correctAlpha : MEMORY_BASKET_TUNING.waitingAlpha);
		this.scene.tweens.add({ targets: basket, scale: lit && !reducedMotion(this.scene) ? MEMORY_BASKET_TUNING.correctScale : 1, duration: 120, ease: "Back.easeOut" });
	}

	private resetMats() {
		for (const symbol of MARKET_SYMBOLS) this.setMatLit(symbol, false);
	}

	private setBasketRest(symbol: MarketSymbol) {
		const basket = this.baskets.get(symbol);
		if (!basket) return;
		this.scene.tweens.killTweensOf(basket);
		basket.setFillStyle(SYMBOL_COLORS[symbol], MEMORY_BASKET_TUNING.restAlpha).setScale(1);
	}

	private resetBaskets() {
		for (const symbol of MARKET_SYMBOLS) this.setBasketRest(symbol);
	}

	private schedule(delay: number, callback: () => void) {
		const timer = this.scene.time.delayedCall(delay, callback);
		this.timers.push(timer);
		return timer;
	}

	private cancelTimers() {
		for (const timer of this.timers) timer.remove();
		this.timers = [];
		this.idleTimer = null;
	}

	private addBlocker() {
		const b = LANE2.blocker;
		const blocker = this.scene.add.rectangle(b.x + b.width / 2, b.y + b.height / 2, b.width, b.height).setVisible(false);
		this.scene.physics.add.existing(blocker, true);
		this.worldColliders.add(blocker);
		return blocker;
	}

	stop() {
		if (this.stopped) return;
		this.stopped = true;
		this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layoutControls);
		this.scene.game.registry.events.off(TEXT_SCALE_CHANGED, this.layoutControls);
		this.scene.input.keyboard?.off("keydown", this.onKey);
		this.uiObjects.forEach(o => o.destroy());
		this.cancelTimers();
		this.scene.tweens.killTweensOf(this.rope);
		for (const symbol of MARKET_SYMBOLS) this.interactions.removeZone(`market-memory-basket-${symbol}`);
		// Scene shutdown owns static-body destruction; the StaticGroup may already be torn down.
		this.ropeBlocker = null;
		this.rope.destroy();
		this.status.destroy();
		for (const dot of this.pips) dot.destroy();
		this.pips = [];
		for (const glow of this.matGlows.values()) glow.destroy();
		this.matGlows.clear();
		for (const basket of this.baskets.values()) basket.destroy();
		this.baskets.clear();
	}
}
