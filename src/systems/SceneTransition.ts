import Phaser from "phaser";
import { PALETTE } from "./palette";
import { getAudio } from "./audio";
import type { Facing } from "./playerMovement";

export interface Door {
	x: number;
	y: number;
	radius: number;
	target: string;
	spawnId: string;
	/** How far above (x, y) the bobbing arrow floats -- defaults to a small offset suiting a
	 * normal door. A wide landmark opening (an archway, not a single door) wants the arrow much
	 * higher, near the structure's own visual top, not hovering at ground level in the doorway. */
	arrowOffsetY?: number;
	/** Skips the bobbing arrow entirely -- for a door whose own opening is already an obvious
	 * landmark (the market arch, banner and all), the arrow reads as clutter rather than a hint. */
	hideArrow?: boolean;
	/** Which way Frankie must be facing for this door to fire.
	 *
	 * Every door in the game sits on a horizontal wall and is meant to be walked into head-on --
	 * north into a facade, south into the wall below her. Without this, brushing past one sideways
	 * while its radius happens to overlap teleports you ("you can sometimes enter and exit areas by
	 * walking sideways"), which reads as the room grabbing you rather than you choosing to leave.
	 * Omit it to keep the old any-direction behaviour. */
	enterFacing?: Facing;
}

const FACING_STEP: Record<string, { x: number; y: number }> = { north: { x: 0, y: -12 }, south: { x: 0, y: 12 }, east: { x: 12, y: 0 }, west: { x: -12, y: 0 } };
const PENDING_SPAWN_KEY = "frankie:pendingSpawn";
const FADE_MS = 300;

interface DoorEntry {
	door: Door;
	getPlayerPosition: () => { x: number; y: number };
	canPass: () => boolean;
	onBlocked?: () => void;
	arrow: Phaser.GameObjects.Text | null;
	glow: Phaser.GameObjects.Ellipse;
	glowTween: Phaser.Tweens.Tween | null;
}

export class SceneTransition {
	private scene: Phaser.Scene;
	private doors: DoorEntry[] = [];
	private firing = false;
	private armed = false;
	private goalResolver: () => string | null = () => null;
	private lastGoal: string | null | undefined = undefined;

	constructor(scene: Phaser.Scene, private getPlayerFacing: () => Facing) {
		this.scene = scene;
	}

	/** Which scene the player should be heading to next, if the way forward is a door in this
	 * scene (see src/data/objectives.ts). The matching door gets a warm pulsing glow and an accent-
	 * coloured arrow; every other door keeps the plain landmark treatment. Re-evaluated every
	 * frame in update() -- it's a cheap comparison, and the goal changes mid-scene (flour handed
	 * over, last hen home) without any other event this class could hook. */
	setGoalResolver(resolver: () => string | null) {
		this.goalResolver = resolver;
		this.lastGoal = undefined;
	}

	/** `canPass`/`onBlocked` gate a door behind a condition (e.g. a quest not yet done) --
	 * defaults to always passable for doors with no such condition. */
	/** The doors registered in this scene (TapMove walks up to and through them). */
	doorList(): Door[] {
		return this.doors.map((d) => d.door);
	}

	addDoor(door: Door, getPlayerPosition: () => { x: number; y: number }, canPass: () => boolean = () => true, onBlocked?: () => void) {
		// The "this is the way" glow: a soft warm pool on the floor at the threshold, additive so it
		// lights whatever it sits on rather than painting an orange disc over it. Created up front
		// (hidden) rather than on first use, because attachGameplay snapshots the UI camera's ignore
		// list once, right after the scene's doors are registered -- anything created later renders
		// on both cameras. Sized off the door's own radius so a doorway gets a doormat and the market
		// arch gets a threshold as wide as its opening.
		const glow = this.scene.add
			.ellipse(door.x, door.y + 2, Math.max(56, door.radius * 3), Math.max(22, door.radius * 1.2), PALETTE.accent, 0.42)
			.setBlendMode(Phaser.BlendModes.ADD)
			.setDepth(8990)
			.setVisible(false);

		let arrow: Phaser.GameObjects.Text | null = null;
		if (!door.hideArrow) {
			// A Pokemon-style bobbing arrow marking the exit -- a map landmark, not a proximity
			// hint, so it's always visible rather than gated on distance like InteractionManager's
			// "!" badge. World-space (not scrollFactor(0)) since it marks a place, not the screen.
			arrow = this.scene.add
				.text(door.x, door.y + (door.arrowOffsetY ?? -18), "▼", { fontFamily: "\"Pixelify Sans\", monospace", fontSize: "18px", color: PALETTE.css.panelLight, stroke: PALETTE.css.shadow, strokeThickness: 3 })
				.setOrigin(0.5)
				.setDepth(9000);
			this.scene.tweens.add({ targets: arrow, y: arrow.y + 5, duration: 500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
		}
		this.doors.push({ door, getPlayerPosition, canPass, onBlocked, arrow, glow, glowTween: null });
		this.lastGoal = undefined;
	}

	private refreshGoal() {
		const goal = this.goalResolver();
		if (goal === this.lastGoal) return;
		this.lastGoal = goal;
		for (const entry of this.doors) {
			const isGoal = goal !== null && entry.door.target === goal;
			entry.arrow?.setColor(isGoal ? PALETTE.css.accent : PALETTE.css.panelLight);
			entry.glowTween?.stop();
			entry.glowTween = null;
			entry.glow.setVisible(isGoal);
			if (isGoal) {
				entry.glow.setAlpha(0.42);
				// Slow breathe, not a blink: a landmark you can find from across the room, not an
				// alarm. Same cadence family as the arrow bob so the two read as one object.
				entry.glowTween = this.scene.tweens.add({ targets: entry.glow, alpha: 0.18, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
			}
		}
	}

	/** Call every frame from the scene's update(). */
	update() {
		this.refreshGoal();
		if (this.firing) return;
		if (!this.armed) {
			const clear = this.doors.every(({ door, getPlayerPosition }) => {
				const p = getPlayerPosition();
				return Math.hypot(door.x - p.x, door.y - p.y) > door.radius;
			});
			if (clear) this.armed = true;
			return;
		}
		for (const { door, getPlayerPosition, canPass, onBlocked } of this.doors) {
			const player = getPlayerPosition();
			if (Math.hypot(door.x - player.x, door.y - player.y) <= door.radius) {
				// Facing, not velocity: the wall behind the door has already stopped her by the time
				// she is inside the radius, so her velocity is ~0 exactly when it would matter. Facing
				// persists, so standing in the doorway and turning to face it still works -- what it
				// rules out is being carried through while walking along the wall.
				if (door.enterFacing && this.getPlayerFacing() !== door.enterFacing) continue;
				if (canPass()) {
					this.go(door);
				} else {
					// Same re-arm gate as a real transition, so this only fires once per approach
					// instead of every frame he's pressed against the door.
					this.armed = false;
					onBlocked?.();
				}
				return;
			}
		}
	}

	private go(door: Door) {
		this.firing = true;
		this.armed = false;
		getAudio(this.scene).sfx("door-open");
		this.scene.game.registry.set(PENDING_SPAWN_KEY, door.spawnId);
		// Two steps into the doorway while the room fades, so leaving reads as going through a
		// door rather than the picture switching off. The walk animation is already playing if he
		// walked in; the tween moves the sprite only (the body is about to be discarded).
		const frankie = (this.scene as unknown as { frankie?: Phaser.GameObjects.Sprite }).frankie;
		const step = FACING_STEP[door.enterFacing ?? ""];
		if (frankie && step) this.scene.tweens.add({ targets: frankie, x: frankie.x + step.x, y: frankie.y + step.y, duration: FADE_MS, ease: "Sine.easeIn" });
		this.scene.cameras.main.fadeOut(FADE_MS, 0, 0, 0);
		this.scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
			this.scene.scene.start(door.target);
		});
	}

	/** Reads and clears the pending spawn id, or null on a fresh boot into the scene. */
	static consumePendingSpawn(scene: Phaser.Scene): string | null {
		const id = scene.game.registry.get(PENDING_SPAWN_KEY) as string | undefined;
		if (id) scene.game.registry.remove(PENDING_SPAWN_KEY);
		return id ?? null;
	}

	/** Call once near the top of create(), after the camera exists, to fade the new scene in. */
	static fadeIn(scene: Phaser.Scene) {
		scene.cameras.main.fadeIn(FADE_MS, 0, 0, 0);
	}
}
