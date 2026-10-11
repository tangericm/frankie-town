import Phaser from "phaser";
import {
	laneActorDepth,
	PIGEON_AMBIENT_PERCHES,
	PIGEON_ANIMATIONS,
	PIGEON_PHASES,
	PIGEON_ROUTES,
	PIGEON_TUNING,
} from "../../data/market.gameplay";

type Phase = (typeof PIGEON_PHASES)[number]["phase"];

export class PigeonLane {
	private pigeons: Phaser.Physics.Arcade.Sprite[] = [];
	private overlaps: Phaser.Physics.Arcade.Collider[] = [];
	private timer: Phaser.Time.TimerEvent | null = null;
	private phaseIndex = 0;
	private started = false;
	private cleared: boolean;
	private stopped = false;
	/** Flips once per full phase cycle (see applyPhase) so the flock's overall dart direction
	 * alternates instead of always crossing the same way -- previously each pigeon's own
	 * left/right start was fixed forever, so the flock "crossed one way and then disappeared and
	 * reset" instead of visibly going back and forth. */
	private flip = false;
	// Keep flock travel on the same clock as its phase timer behind a HUD panel.
	private syncPause = () => {
		for (const tween of this.scene.tweens.getTweensOf(this.pigeons)) tween.paused = this.scene.time.paused;
	};

	constructor(
		private scene: Phaser.Scene,
		frankie: Phaser.GameObjects.Sprite,
		private enabled: () => boolean,
		private resetFrankie: () => void,
		cleared: boolean,
	) {
		this.cleared = cleared;
		this.defineAnimations();
		for (let i = 0; i < PIGEON_ROUTES.length; i += 1) {
			const route = PIGEON_ROUTES[i];
			const startsLeft = i % 2 === 0;
			const point = startsLeft ? route.left : route.right;
			const sprite = scene.physics.add.sprite(point.x, point.y, PIGEON_ANIMATIONS.idleEast.texture, PIGEON_ANIMATIONS.idleEast.startFrame)
				.setOrigin(0.5, 1)
				.setDepth(laneActorDepth(point.x, point.y));
			const body = sprite.body as Phaser.Physics.Arcade.Body;
			body.setSize(PIGEON_TUNING.body.width, PIGEON_TUNING.body.height, false);
			body.setOffset((44 - PIGEON_TUNING.body.width) / 2, 44 - PIGEON_TUNING.body.height);
			body.enable = false;
			this.pigeons.push(sprite);
			this.overlaps.push(scene.physics.add.overlap(frankie, sprite, () => this.onHit()));
		}
		if (cleared) this.setAmbient();
		scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.syncPause);
	}

	private defineAnimations() {
		for (const animation of Object.values(PIGEON_ANIMATIONS)) {
			if (this.scene.anims.exists(animation.key)) continue;
			this.scene.anims.create({
				key: animation.key,
				frames: this.scene.anims.generateFrameNumbers(animation.texture, { start: animation.startFrame, end: animation.endFrame }),
				frameRate: animation.frameRate,
				repeat: -1,
			});
		}
	}

	update() {
		if (!this.started && !this.cleared && this.enabled()) {
			this.started = true;
			this.applyPhase();
		}
	}

	private applyPhase() {
		if (this.cleared || this.stopped) return;
		const phaseData = PIGEON_PHASES[this.phaseIndex];
		this.renderPhase(phaseData.phase);
		this.timer = this.scene.time.delayedCall(phaseData.durationMs, () => {
			// Flip right as a "gap" ends, before the next "idle" starts a fresh cycle -- once per
			// full loop, not once per phase.
			if (PIGEON_PHASES[this.phaseIndex].phase === "gap") this.flip = !this.flip;
			this.phaseIndex = (this.phaseIndex + 1) % PIGEON_PHASES.length;
			this.applyPhase();
		});
	}

	private renderPhase(phase: Phase) {
		for (let i = 0; i < this.pigeons.length; i += 1) {
			const sprite = this.pigeons[i];
			const route = PIGEON_ROUTES[i];
			const startsLeft = (i % 2 === 0) !== this.flip;
			const from = startsLeft ? route.left : route.right;
			const to = startsLeft ? route.right : route.left;
			const east = startsLeft;
			const body = sprite.body as Phaser.Physics.Arcade.Body;
			this.scene.tweens.killTweensOf(sprite);
			body.enable = false;
			if (phase === "idle") {
				// Always visible already (gap no longer hides it) -- this just settles it back into
				// its own idle pose at the side it's about to walk from.
				sprite.setPosition(from.x, from.y).setAlpha(1).setVisible(true).play(east ? PIGEON_ANIMATIONS.idleEast.key : PIGEON_ANIMATIONS.idleWest.key, true);
			} else if (phase === "walk") {
				sprite.setPosition(from.x, from.y).setVisible(true).play(east ? PIGEON_ANIMATIONS.walkEast.key : PIGEON_ANIMATIONS.walkWest.key, true);
				this.scene.tweens.add({ targets: sprite, x: from.x + (east ? 24 : -24), duration: PIGEON_PHASES[1].durationMs, onUpdate: () => sprite.setDepth(laneActorDepth(sprite.x, sprite.y)) });
			} else if (phase === "flap") {
				sprite.setVisible(true).play(east ? PIGEON_ANIMATIONS.flapEast.key : PIGEON_ANIMATIONS.flapWest.key, true);
			} else if (phase === "dart") {
				sprite.setPosition(from.x, from.y).setVisible(true).play(east ? PIGEON_ANIMATIONS.flapEast.key : PIGEON_ANIMATIONS.flapWest.key, true);
				body.enable = true;
				body.reset(from.x, from.y);
				this.scene.tweens.add({
					targets: sprite,
					x: to.x,
					duration: PIGEON_PHASES[3].durationMs,
					delay: i * PIGEON_TUNING.flockStaggerMs,
					ease: "Linear",
					// Without this, depth freezes at whatever it was when the dart started (always
					// inside a wall band, since that's where "from" sits) for the entire flight,
					// including the open middle of the lane where laneActorDepth must NOT floor it.
					onUpdate: () => sprite.setDepth(laneActorDepth(sprite.x, sprite.y)),
				});
			} else {
				// "gap" -- stays put, fully visible, exactly where the dart landed (`to`), instead of
				// fading out and parking off past the stage edge. It should read as "the flock made it
				// across and is resting on the other side," not "vanished and will reappear later"
				// ("they should move back and forth, not fly and disappear and reappear"). The next
				// cycle's own flip already sends it back the way it came.
				sprite.setPosition(to.x, to.y).setAlpha(1).setVisible(true);
			}
		}
	}

	private onHit() {
		if (!this.enabled() || this.cleared || PIGEON_PHASES[this.phaseIndex].phase !== "dart") return;
		this.resetFrankie();
	}

	clearPermanently() {
		if (this.cleared) return;
		this.cleared = true;
		this.timer?.remove();
		this.timer = null;
		this.setAmbient();
	}

	debugState() {
		// phaseIndex as well as the name, matching CartLane -- the lane-difficulty harness
		// (scripts/tests/manual-test-lane3.mjs) samples a whole cycle by phase index.
		return { phase: this.cleared ? "cleared" : PIGEON_PHASES[this.phaseIndex].phase, phaseIndex: this.phaseIndex, cleared: this.cleared };
	}

	hitForDebug() {
		if (!this.cleared) this.resetFrankie();
	}

	private setAmbient() {
		for (let i = 0; i < this.pigeons.length; i += 1) {
			const sprite = this.pigeons[i];
			const perch = PIGEON_AMBIENT_PERCHES[i];
			const body = sprite.body as Phaser.Physics.Arcade.Body;
			this.scene.tweens.killTweensOf(sprite);
			body.enable = false;
			sprite.setAlpha(0).setVisible(true).setPosition(perch.x, perch.y).setDepth(laneActorDepth(perch.x, perch.y))
				.play(perch.facing === "east" ? PIGEON_ANIMATIONS.idleEast.key : PIGEON_ANIMATIONS.idleWest.key, true);
			this.scene.tweens.add({ targets: sprite, alpha: 1, duration: PIGEON_TUNING.fadeMs });
		}
	}

	stop() {
		if (this.stopped) return;
		this.stopped = true;
		this.scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.syncPause);
		this.timer?.remove();
		for (const overlap of this.overlaps) overlap.destroy();
		for (const sprite of this.pigeons) {
			this.scene.tweens.killTweensOf(sprite);
			sprite.destroy();
		}
		this.pigeons = [];
		this.overlaps = [];
	}
}
