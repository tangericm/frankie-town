import Phaser from "phaser";
import { getAudio } from "../audio";
import { burst } from "../juice";
import type { GameState } from "../GameState";
import {
	COOP_GOAL,
	HEN_ANIMATIONS,
	HEN_BOUNDS,
	HEN_IDS,
	HEN_SETTLE_POINTS,
	HEN_STARTS,
	HEN_TUNING,
	henDepth,
} from "../../data/market.gameplay";
import { clampPoint, escapeVelocity, fleeVelocity, nextHenMode, pointInRect, type HenMode, type Point } from "./marketRules";

interface HenActor {
	id: string;
	sprite: Phaser.Physics.Arcade.Sprite;
	mode: HenMode;
	previous: Point;
	nextDecisionAt: number;
	/** When this hen last actually covered ground while fleeing -- see HEN_TUNING.stuckAfterMs. */
	movedAt: number;
	/** While in the future, she is steering along an obstacle instead of straight away from Frankie. */
	unstickUntil: number;
}

export class Herding {
	private hens: HenActor[] = [];
	private colliders: Phaser.Physics.Arcade.Collider[] = [];
	private stopped = false;

	constructor(
		private scene: Phaser.Scene,
		private frankie: Phaser.GameObjects.Sprite,
		worldColliders: Phaser.Physics.Arcade.StaticGroup,
		private gameState: GameState,
		private enabled: () => boolean,
		private ignoreInUi: (o: Phaser.GameObjects.GameObject) => void = () => {},
		private onHomed: (homedCount: number) => void = () => {},
	) {
		this.defineAnimations();
		for (const start of HEN_STARTS) {
			const index = HEN_IDS.indexOf(start.id);
			const homed = gameState.isMarketHenHomed(start.id);
			const position = homed ? HEN_SETTLE_POINTS[index] : start;
			const sprite = scene.physics.add.sprite(position.x, position.y, HEN_ANIMATIONS.idleEast.texture, HEN_ANIMATIONS.idleEast.startFrame)
				.setOrigin(0.5, 1)
				.setDepth(position.y);
			const body = sprite.body as Phaser.Physics.Arcade.Body;
			body.setSize(HEN_TUNING.body.width, HEN_TUNING.body.height, false);
			body.setOffset((34 - HEN_TUNING.body.width) / 2, 34 - HEN_TUNING.body.height);
			body.setMaxSpeed(HEN_TUNING.fleeSpeed);
			if (homed) {
				body.enable = false;
				sprite.alpha = 0;
				sprite.setVisible(false);
			} else {
				this.colliders.push(scene.physics.add.collider(sprite, worldColliders));
				sprite.play(HEN_ANIMATIONS.idleEast.key);
			}
			this.hens.push({ id: start.id, sprite, mode: homed ? "homed" : "idle", previous: { x: position.x, y: position.y }, nextDecisionAt: 0, movedAt: 0, unstickUntil: 0 });
		}
	}

	private defineAnimations() {
		for (const animation of Object.values(HEN_ANIMATIONS)) {
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
		if (this.stopped) return;
		for (const hen of this.hens) {
			if (hen.mode === "homed" || hen.mode === "settle") continue;
			const current = { x: hen.sprite.x, y: hen.sprite.y };
			// Simple contact, not "must cross this precise line on this exact frame" -- a fleeing
			// hen's path is erratic, and needing a clean directional crossing into a narrow rect left
			// her running right along the coop's own front without ever triggering ("should be able
			// to enter as long as they are in contact with the front of the coop").
			if (this.enabled() && pointInRect(current, COOP_GOAL)) {
				this.home(hen);
				continue;
			}
			// Distance actually covered since the last frame, which is what tells a hen pressed into a
			// wall apart from one running freely -- her velocity stays at full tilt either way.
			const travelled = Math.hypot(current.x - hen.previous.x, current.y - hen.previous.y);
			const now = this.scene.time.now;
			// Distance alone is not enough at a HEN_BOUNDS edge. There, physics pushes the hen past
			// the limit and the clamp below snaps her back, so she alternates between "moved 1.1px"
			// and "moved 0px" frames -- and the moved frames refreshed movedAt forever, so the
			// unstick never armed in the one place it was needed most. A hen pinned against the
			// yard's own boundary could not be pushed off it at all, from any angle a player would
			// naturally push from, indefinitely. Sitting on the edge counts as not having moved;
			// once the unstick steers her along it and she leaves, normal fleeing resumes.
			const onEdge = current.x <= HEN_BOUNDS.x + 1 || current.x >= HEN_BOUNDS.x + HEN_BOUNDS.width - 1
				|| current.y <= HEN_BOUNDS.y + 1 || current.y >= HEN_BOUNDS.y + HEN_BOUNDS.height - 1;
			if ((travelled > HEN_TUNING.stuckSpeedPx * (this.scene.game.loop.delta / 1000) && !onEdge) || hen.mode !== "flee") hen.movedAt = now;
			hen.previous = current;
			const body = hen.sprite.body as Phaser.Physics.Arcade.Body;
			if (this.scene.physics.world.isPaused) {
				body.setVelocity(0, 0);
				continue;
			}

			// Ambient peck/wander runs unconditionally (any hen not yet homed/settling) -- only
			// fleeing from Frankie and actually homing require the quest to be unlocked and the gate
			// open. Previously the whole block below was gated on `enabled()` too, so hens stood
			// frozen in the idle pose behind the fence the entire time before the gate opened, then
			// sprang to life the instant Frankie walked in ("hens should be moving already before
			// Frankie enters the coop").
			const distance = this.enabled()
				? Phaser.Math.Distance.Between(hen.sprite.x, hen.sprite.y, this.frankie.x, this.frankie.y)
				: Infinity;
			hen.mode = nextHenMode(hen.mode, distance, HEN_TUNING.panicRadius, HEN_TUNING.releaseRadius);
			if (hen.mode === "flee") {
				if (now - hen.movedAt >= HEN_TUNING.stuckAfterMs && now >= hen.unstickUntil) {
					hen.unstickUntil = now + HEN_TUNING.unstickMs;
				}
				const velocity = now < hen.unstickUntil
					? escapeVelocity(hen.sprite, this.frankie, HEN_BOUNDS, HEN_TUNING.fleeSpeed)
					: fleeVelocity(hen.sprite, this.frankie, HEN_TUNING.fleeSpeed);
				body.setVelocity(velocity.x, velocity.y);
				this.playDirectional(hen.sprite, "run", velocity.x);
			} else if (this.scene.time.now >= hen.nextDecisionAt) {
				hen.nextDecisionAt = this.scene.time.now + Phaser.Math.Between(HEN_TUNING.idleDecisionMinMs, HEN_TUNING.idleDecisionMaxMs);
				if (Math.random() < 0.45) {
					body.setVelocity(0, 0);
					this.playDirectional(hen.sprite, "peck", hen.sprite.flipX ? -1 : 1);
				} else {
					const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
					body.setVelocity(Math.cos(angle) * HEN_TUNING.idleWanderSpeed, Math.sin(angle) * HEN_TUNING.idleWanderSpeed);
					// Nonzero velocity -- must be the walk cycle, not the (stationary-looking)
					// idle pose, or the hen visibly slides instead of walking.
					this.playDirectional(hen.sprite, "run", body.velocity.x);
				}
			}

			const clamped = clampPoint(hen.sprite, HEN_BOUNDS);
			if (clamped.x !== hen.sprite.x) body.setVelocityX(0);
			if (clamped.y !== hen.sprite.y) body.setVelocityY(0);
			hen.sprite.setPosition(clamped.x, clamped.y).setDepth(henDepth(clamped.x, clamped.y));
		}
	}

	private playDirectional(sprite: Phaser.Physics.Arcade.Sprite, motion: "idle" | "peck" | "run", x: number) {
		const direction = x < 0 ? "West" : "East";
		const animation = HEN_ANIMATIONS[`${motion}${direction}` as keyof typeof HEN_ANIMATIONS];
		sprite.play(animation.key, true);
	}

	private home(hen: HenActor) {
		hen.mode = "settle";
		const body = hen.sprite.body as Phaser.Physics.Arcade.Body;
		body.stop();
		body.enable = false;
		this.gameState.homeMarketHen(hen.id);
		getAudio(this.scene).sfx("cluck", { detune: Phaser.Math.Between(-300, 300) });
		burst(this.scene, hen.sprite.x, hen.sprite.y - 6, 0xfff4d6, this.ignoreInUi, { shape: "feather", count: 8, speed: { min: 30, max: 90 }, depth: hen.sprite.y + 2 });
		this.onHomed(this.gameState.marketHensHomedCount());
		const settle = HEN_SETTLE_POINTS[HEN_IDS.indexOf(hen.id as (typeof HEN_IDS)[number])];
		this.scene.tweens.add({
			targets: hen.sprite,
			x: settle.x,
			y: settle.y,
			duration: HEN_TUNING.settleDurationMs,
			ease: "Quad.easeOut",
			onComplete: () => {
				hen.sprite.setDepth(settle.y);
				// Walked itself into the coop -- fades out and hides rather than sitting visible in
				// the yard, so "homed" actually reads as "inside," not "stopped at the door."
				this.scene.tweens.add({
					targets: hen.sprite,
					alpha: 0,
					duration: HEN_TUNING.homedFadeMs,
					onComplete: () => {
						hen.sprite.setVisible(false);
						hen.mode = "homed";
					},
				});
			},
		});
	}

	homeForDebug(id: string) {
		const hen = this.hens.find((candidate) => candidate.id === id);
		if (hen && hen.mode !== "homed" && hen.mode !== "settle") this.home(hen);
	}

	debugState() {
		return this.hens.map((hen) => ({ id: hen.id, mode: hen.mode, x: hen.sprite.x, y: hen.sprite.y, unstickIn: Math.round(hen.unstickUntil - this.scene.time.now), sinceMoved: Math.round(this.scene.time.now - hen.movedAt) }));
	}

	stop() {
		if (this.stopped) return;
		this.stopped = true;
		for (const collider of this.colliders) collider.destroy();
		for (const hen of this.hens) {
			this.scene.tweens.killTweensOf(hen.sprite);
			hen.sprite.destroy();
		}
		this.colliders = [];
		this.hens = [];
	}
}
