import Phaser from "phaser";
import { getAudio } from "../audio";
import { reducedMotion, reward } from "../juice";
import type { GameState } from "../GameState";
import type { InteractionManager } from "../InteractionManager";
import {
	MARKET_REWARDS,
	SUGAR_PICKUP_TUNING,
	SUGAR_PROGRESS_LABELS,
	type MarketLaneId,
} from "../../data/market.gameplay";

interface CubeConfig {
	id: MarketLaneId;
	x: number;
	y: number;
	texture: string;
}

export class SugarPickup {
	private halo: Phaser.GameObjects.Arc | null = null;
	private sparkleTimer: Phaser.Time.TimerEvent | null = null;
	private active = false;
	private collected: boolean;
	private stopped = false;
	private still: boolean | null = null;
	private restY: number;

	constructor(
		private scene: Phaser.Scene,
		private interactions: InteractionManager,
		private gameState: GameState,
		private cube: CubeConfig,
		private image: Phaser.GameObjects.Image,
		private enabled: () => boolean,
		private onLaneClear: () => void,
		private onWorldObjectCreated: (object: Phaser.GameObjects.GameObject) => void,
		_hideFromWorldCamera: (object: Phaser.GameObjects.GameObject) => void = () => {},
		/** The third cube earns the sugar itself: the ceremony, given where the cube was. */
		private onIngredient: (source: { x: number; y: number }) => void = () => {},
	) {
		this.restY = image.y;
		this.collected = gameState.hasMarketSugarCube(cube.id);
		if (this.collected) {
			image.destroy();
			return;
		}
		this.decorate();
		this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.syncMotion);
	}

	update() {
		if (this.stopped || this.collected || this.active || !this.enabled()) return;
		this.active = true;
		this.interactions.addZone({
			id: `market-sugar-${this.cube.id}`,
			x: this.cube.x,
			y: this.cube.y,
			radius: SUGAR_PICKUP_TUNING.interactRadius,
			indicatorOffset: 24,
			kind: "item",
			gameObject: this.image,
			onInteract: () => this.collect(),
		});
	}

	private decorate() {
		this.halo = this.scene.add.circle(this.cube.x, this.cube.y, SUGAR_PICKUP_TUNING.haloRadius, 0xffe58c, SUGAR_PICKUP_TUNING.haloAlpha)
			.setStrokeStyle(2, 0xfff3bd, 1)
			.setDepth(this.image.depth - 1);
		this.syncMotion();
	}

	private syncMotion = () => {
		if (this.stopped || this.collected || !this.halo) return;
		const still = reducedMotion(this.scene);
		if (still === this.still) return;
		this.still = still;
		this.scene.tweens.killTweensOf([this.image, this.halo]);
		this.image.setY(this.restY);
		this.halo.setY(this.cube.y).setScale(1).setAlpha(1);
		this.sparkleTimer?.remove();
		this.sparkleTimer = null;
		if (still) return;
		this.scene.tweens.add({
			targets: [this.image, this.halo],
			y: `-=${SUGAR_PICKUP_TUNING.bobDistancePx}`,
			duration: SUGAR_PICKUP_TUNING.bobDurationMs,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
		});
		// A breathing pulse independent of the bob above -- the flat halo alone read as a faint
		// static ring, easy to miss against the busy stall art around it.
		this.scene.tweens.add({
			targets: this.halo,
			scale: SUGAR_PICKUP_TUNING.haloPulseScale,
			alpha: SUGAR_PICKUP_TUNING.haloAlpha * 0.5,
			duration: SUGAR_PICKUP_TUNING.haloPulseMs,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
		});
		this.sparkleTimer = this.scene.time.addEvent({
			delay: SUGAR_PICKUP_TUNING.sparkleIntervalMs,
			loop: true,
			callback: () => this.sparkle(),
		});
	};

	private sparkle() {
		if (this.collected || reducedMotion(this.scene) || !this.enabled()) return;
		const distance = Phaser.Math.Between(SUGAR_PICKUP_TUNING.sparkleMinOffsetPx, SUGAR_PICKUP_TUNING.sparkleMaxOffsetPx);
		const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
		const sparkle = this.scene.add.rectangle(
			this.cube.x + Math.cos(angle) * (16 + distance),
			this.cube.y + Math.sin(angle) * (16 + distance),
			2,
			2,
			0xfff7cf,
			0.95,
		).setDepth(this.image.depth + 1);
		this.onWorldObjectCreated(sparkle);
		this.scene.tweens.add({ targets: sparkle, alpha: 0, scale: 0.25, duration: 420, onComplete: () => sparkle.destroy() });
	}

	collect() {
		if (!this.active || this.collected || !this.enabled()) return;
		this.active = false;
		this.collected = true;
		this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.syncMotion);
		this.interactions.removeZone(`market-sugar-${this.cube.id}`);
		this.gameState.collectMarketSugarCube(this.cube.id);
		getAudio(this.scene).sfx("pickup");
		const frankie = (this.scene as unknown as { frankie?: Phaser.GameObjects.Sprite }).frankie;
		const count = this.gameState.marketSugarCubeCount();
		// Pop size: gold grains and a "+1"-style count, and Frankie's hop. The third cube goes on
		// to the ceremony below, so it gets no separate hop of its own.
		reward.pop(this.scene, { x: this.cube.x, y: this.cube.y }, 0xfff1a8, this.onWorldObjectCreated, { frankie: count < SUGAR_PROGRESS_LABELS.length ? frankie ?? null : null, count: 12, sting: false });
		this.onLaneClear();
		this.sparkleTimer?.remove();
		this.scene.tweens.killTweensOf(this.image);
		if (this.halo) this.scene.tweens.killTweensOf(this.halo);
		this.scene.tweens.add({
			targets: [this.image, ...(this.halo ? [this.halo] : [])],
			...(!reducedMotion(this.scene) ? { y: "-=8", scaleX: 1.25, scaleY: 0.65 } : {}),
			alpha: 0,
			duration: SUGAR_PICKUP_TUNING.pickupDurationMs,
			onComplete: () => {
				this.image.destroy();
				this.halo?.destroy();
				this.halo = null;
			},
		});
		this.showProgress(count);
		if (count === SUGAR_PROGRESS_LABELS.length && !this.gameState.hasIngredient(MARKET_REWARDS.sugar.ingredient)) {
			this.gameState.addIngredient(MARKET_REWARDS.sugar.ingredient);
			this.onIngredient({ x: this.cube.x, y: this.cube.y });
		}
	}

	collectForDebug() {
		this.update();
		this.collect();
	}

	debugState() {
		return { id: this.cube.id, collected: this.collected, active: this.active };
	}

	private showProgress(count: number) {
		const text = this.scene.add.text(this.cube.x, this.cube.y - 24, SUGAR_PROGRESS_LABELS[count - 1], {
			fontFamily: '"Pixelify Sans", monospace',
			fontSize: "15px",
			color: "#fff7cf",
			stroke: "#493329",
			strokeThickness: 3,
		}).setOrigin(0.5).setDepth(9000);
		this.onWorldObjectCreated(text);
		this.scene.tweens.add({ targets: text, ...(!reducedMotion(this.scene) ? { y: text.y - 12 } : {}), alpha: 0, duration: 700, onComplete: () => text.destroy() });
	}

	stop() {
		if (this.stopped) return;
		this.stopped = true;
		this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.syncMotion);
		this.interactions.removeZone(`market-sugar-${this.cube.id}`);
		this.sparkleTimer?.remove();
		this.scene.tweens.killTweensOf(this.image);
		if (this.halo) this.scene.tweens.killTweensOf(this.halo);
		this.image.destroy();
		this.halo?.destroy();
	}
}
