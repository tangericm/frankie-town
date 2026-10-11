import Phaser from "phaser";
import { CART_ANIMATION, CART_ART_BOUNDS, CART_PHASES, CART_TUNING, LANE3, laneActorDepth } from "../../data/market.gameplay";

export class CartLane {
	private cart: Phaser.Physics.Arcade.Sprite;
	private overlap: Phaser.Physics.Arcade.Collider;
	private solid: Phaser.Physics.Arcade.Collider;
	private timer: Phaser.Time.TimerEvent | null = null;
	private dustTimer: Phaser.Time.TimerEvent | null = null;
	private phaseIndex = 0;
	private started = false;
	private cleared: boolean;
	private stopped = false;
	/** Which way the NEXT crossing runs. Flipped at the end of every crossing, so the cart goes out
	 * and comes back within one cycle (see CART_PHASES) instead of only alternating between cycles.
	 * Every non-crossing phase parks the cart at `endpoints().from` -- the start of the crossing it
	 * is waiting on -- which is also exactly where it already is. */
	private direction: 1 | -1 = 1;
	// Keep travel on the same clock as its phase timer while a HUD panel is open.
	private syncPause = () => {
		for (const tween of this.scene.tweens.getTweensOf(this.cart)) tween.paused = this.scene.time.paused;
	};

	constructor(
		private scene: Phaser.Scene,
		frankie: Phaser.GameObjects.Sprite,
		private enabled: () => boolean,
		private resetFrankie: () => void,
		cleared: boolean,
		private onWorldObjectCreated: (object: Phaser.GameObjects.GameObject) => void = () => {},
	) {
		this.cleared = cleared;
		if (!scene.anims.exists(CART_ANIMATION.key)) {
			scene.anims.create({
				key: CART_ANIMATION.key,
				frames: scene.anims.generateFrameNumbers(CART_ANIMATION.texture, { start: CART_ANIMATION.startFrame, end: CART_ANIMATION.endFrame }),
				frameRate: CART_ANIMATION.frameRate,
				repeat: -1,
			});
		}
		this.cart = scene.physics.add.sprite(LANE3.parking.x, LANE3.parking.y, CART_ANIMATION.texture, CART_ANIMATION.parkedFrame)
			.setOrigin(0.5, 1)
			.setDepth(laneActorDepth(LANE3.parking.x, LANE3.route.y));
		const body = this.cart.body as Phaser.Physics.Arcade.Body;
		body.setSize(CART_TUNING.body.width, CART_TUNING.body.height, false);
		// Placed off the cart's own painted bounds, not centred in its 64px frame. The art is not
		// centred (local x1-61, y12-61 of a frame anchored (0.5, 1)), so centring the box left the
		// wheels outside it -- see CART_TUNING.body.
		body.setOffset(32 + CART_ART_BOUNDS.left, 64 + CART_ART_BOUNDS.bottom - CART_TUNING.body.height);
		// The body stays enabled for the cart's whole life now. It used to be switched on only for the
		// "crossing" phase, which left the parked cart with no collision at all -- Frankie walked
		// straight through it where it sits waiting at each end of the lane ("in the third lane,
		// Frankie can actually walk through the cart at the very end").
		body.enable = true;
		body.immovable = true;
		this.overlap = scene.physics.add.overlap(frankie, this.cart, () => this.onHit());
		// Solid while parked or warming up; while crossing, the contact itself IS the hazard.
		//
		// The hit is decided here, in the process callback, rather than being left to the overlap
		// above. A process callback runs on any bounds contact, before separation; the overlap
		// callback only fires once the two bodies actually interpenetrate. Walking north into the
		// SIDE of a crossing cart never gets that far -- Frankie is stopped at exactly touching, with
		// zero penetration, every frame. Measured: approaching the returning cart pinned him at y231
		// (his body top on the cart's body bottom, both 217) for ~450ms while it rolled through him,
		// then let him walk on unharmed. A cart passing straight over him hit correctly, so the lane
		// hit you for standing still and forgave you for walking into it.
		this.solid = scene.physics.add.collider(frankie, this.cart, undefined, () => {
			if (!this.isCrossing()) return true;
			this.onHit();
			// ...and never separate while crossing: shoving Frankie out of the way would make the
			// hazard unhittable, which is the bug this whole callback exists to avoid.
			return false;
		});
		scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.syncPause);
	}

	update() {
		if (!this.started && !this.cleared && this.enabled()) {
			this.started = true;
			this.applyPhase();
		}
	}

	private applyPhase() {
		if (this.cleared || this.stopped) return;
		const phase = CART_PHASES[this.phaseIndex];
		this.renderPhase(phase);
		this.timer = this.scene.time.delayedCall(phase.durationMs, () => {
			// Flip as each crossing ends: the cart has arrived at that crossing's `to`, and the next
			// crossing has to run back from there. Every waiting phase in between then parks at the
			// new `from`, which is the spot it is already standing on.
			if (CART_PHASES[this.phaseIndex].phase === "crossing") this.direction = this.direction === 1 ? -1 : 1;
			this.phaseIndex = (this.phaseIndex + 1) % CART_PHASES.length;
			this.applyPhase();
		});
	}

	private endpoints() {
		return this.direction === 1
			? { from: LANE3.route.fromX, to: LANE3.route.toX }
			: { from: LANE3.route.toX, to: LANE3.route.fromX };
	}

	private isCrossing() {
		return !this.cleared && CART_PHASES[this.phaseIndex].phase === "crossing";
	}

	private renderPhase(phase: (typeof CART_PHASES)[number]) {
		const body = this.cart.body as Phaser.Physics.Arcade.Body;
		this.scene.tweens.killTweensOf(this.cart);
		this.dustTimer?.remove();
		this.dustTimer = null;
		const { from, to } = this.endpoints();
		if (phase.phase === "crossing") {
			this.cart.setVisible(true).setPosition(from, LANE3.route.y).setFlipX(this.direction === -1).play(CART_ANIMATION.key, true);
			body.reset(from, LANE3.route.y);
			this.scene.tweens.add({
				targets: this.cart,
				x: to,
				// The phase's own duration, not CART_PHASES[1]'s. There is more than one crossing in a
				// cycle now, and a hardcoded index would silently drive both of them at the first
				// one's speed.
				duration: phase.durationMs,
				ease: "Linear",
				// Without this, depth freezes at its parked-position value for the entire crossing,
				// including the open middle of the lane where laneActorDepth must NOT floor it.
				onUpdate: () => this.cart.setDepth(laneActorDepth(this.cart.x, this.cart.y)),
			});
			return;
		}
		// "warning" and "gap" both park the cart, fully visible, at the start of the crossing it is
		// waiting on -- which is the spot it already arrived at, so nothing teleports. It never fades
		// out or parks off past the lane edge ("should not disappear upon reaching one end, it should
		// go then flip and come back").
		this.cart.setVisible(true).stop().setFrame(CART_ANIMATION.parkedFrame).setPosition(from, LANE3.route.y).setFlipX(this.direction === -1);
		// Dust is the tell, and only "warning" gets it: a cart kicking up dust is about to move, a
		// silent one is parked. That makes the dust-free "gap" the readable safe window, and the
		// short turnaround warning a real (but announced) reason not to follow the cart out.
		if (phase.phase !== "warning") return;
		this.dustTimer = this.scene.time.addEvent({
			delay: CART_TUNING.dustIntervalMs,
			repeat: Math.max(1, Math.floor(phase.durationMs / CART_TUNING.dustIntervalMs) - 1),
			callback: () => this.emitDust(from),
		});
	}

	private emitDust(fromX: number) {
		const cue = CART_TUNING.warningCue;
		const dust = this.scene.add.circle(
			fromX + Phaser.Math.Between(-cue.radius, cue.radius),
			cue.y + Phaser.Math.Between(-3, 3),
			Phaser.Math.Between(1, 2),
			0xe6c58d,
			0.75,
		).setDepth(cue.y + 1);
		this.onWorldObjectCreated(dust);
		this.scene.tweens.add({ targets: dust, x: dust.x + 8, y: dust.y - 6, alpha: 0, duration: 360, onComplete: () => dust.destroy() });
	}

	private onHit() {
		if (!this.enabled() || this.cleared || CART_PHASES[this.phaseIndex].phase !== "crossing") return;
		this.resetFrankie();
	}

	clearPermanently() {
		if (this.cleared) return;
		this.cleared = true;
		this.timer?.remove();
		this.dustTimer?.remove();
		this.scene.tweens.killTweensOf(this.cart);
		// Still solid once cleared -- it is parked scenery at that point, and walking through parked
		// scenery is the bug this fixes.
		this.cart.setVisible(true).stop().setFrame(CART_ANIMATION.parkedFrame);
		this.scene.tweens.add({ targets: this.cart, x: LANE3.parking.x, y: LANE3.parking.y, duration: 280, ease: "Quad.easeOut" });
	}

	debugState() {
		// phaseIndex as well as the name: "warning" and "crossing" each appear twice in a cycle now
		// (out and back), and a measurement of the lane's difficulty has to be able to tell the
		// opening warning from the short turnaround.
		return { phase: this.cleared ? "cleared" : CART_PHASES[this.phaseIndex].phase, phaseIndex: this.phaseIndex, cleared: this.cleared, x: this.cart.x };
	}

	hitForDebug() {
		if (!this.cleared) this.resetFrankie();
	}

	stop() {
		if (this.stopped) return;
		this.stopped = true;
		this.scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.syncPause);
		this.timer?.remove();
		this.dustTimer?.remove();
		this.overlap.destroy();
		this.solid.destroy();
		this.scene.tweens.killTweensOf(this.cart);
		this.cart.destroy();
	}
}
