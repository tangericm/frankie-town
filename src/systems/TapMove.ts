import { isScreenUI } from "./uiInput";
import Phaser from "phaser";
import type { InteractionManager, InteractionZone } from "./InteractionManager";
import type { Door } from "./SceneTransition";
import { setTouchVector } from "./playerMovement";
import { buildGrid, findPath, smoothPath, type NavGrid } from "./pathfinding";
import { PALETTE } from "./palette";

/**
 * Tap to move, tap to interact (the Stardew mobile scheme). A tap on open floor walks Frankie
 * there along an A* path over the scene's static bodies; a tap on an interactable he can't reach
 * from where he stands walks him to it and interacts on arrival. The joystick and keyboard still
 * work: any stick drag or movement key cancels the path.
 *
 * Drives him through the same touch vector the joystick writes, so the scenes' update loops
 * (facing, animation, acceleration) need no changes and a path ends exactly like a released thumb.
 */
const WAYPOINT_REACHED_PX = 6;
/** He is accelerated, not teleported: at 110px/s with 900px/s^2 of drive his turning circle is
 * ~13px across, so a waypoint he misses by more than the reached radius has him orbit it at that
 * distance for ever (the 700ms stall then cancelled the walk with the tap unanswered). Within
 * this range, a waypoint that is already behind his direction of travel counts as reached. */
const WAYPOINT_PASSED_PX = 26;
const STALL_MS = 700;
const AFTER_ZONE_TAP_IGNORE_MS = 400;
/** A tap this close to a door means "go through it": the path ends on the door point and he keeps
 * pushing in the door's facing for a moment, which is what the door's radius+facing rule needs. */
const DOOR_TAP_PX = 30;
const DOOR_PUSH_MS = 450;
const FACING_VECTORS: Record<string, { x: number; y: number }> = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 } };

export class TapMove {
	private grid: NavGrid | null = null;
	private gridBodyCount = -1;
	private gridRects: { x: number; y: number; width: number; height: number }[] = [];
	private path: { x: number; y: number }[] = [];
	private onArrive: (() => void) | null = null;
	private lastProgressAt = 0;
	private lastDist = Infinity;
	private marker: Phaser.GameObjects.Arc;
	private zoneTapAt = -Infinity;
	private pushUntil = 0;
	private pushVector: { x: number; y: number } | null = null;
	/** Desktop: a click whose press happened while the world was paused (closing a dialogue) must
	 * not become a walk on release. */
	private downWhilePaused = false;

	constructor(
		private scene: Phaser.Scene,
		private frankie: () => Phaser.GameObjects.Sprite,
		private interactions: InteractionManager,
		private keys: () => (Phaser.Input.Keyboard.Key | undefined)[],
		private isPaused: () => boolean,
		private getDoors: () => Door[] = () => [],
	) {
		this.marker = scene.add.circle(0, 0, 7, PALETTE.accent, 0.55).setDepth(2).setVisible(false).setStrokeStyle(2, PALETTE.panelLight, 0.9);
		scene.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
		scene.game.events.on(Phaser.Core.Events.HIDDEN, this.onBlur, this);
		// Touch movement belongs to the joystick; taps only interact.
		scene.events.on("zone:tap", this.onZoneTap, this);
		// Desktop: a mouse click on the floor is a tap too. TouchControls only listens on touch
		// devices, so this is the only source of taps there.
		if (!scene.sys.game.device.input.touch) {
			scene.input.on("pointerdown", this.onDesktopDown, this);
			scene.input.on("pointerup", this.onDesktopClick, this);
		}
		scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			scene.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
			scene.game.events.off(Phaser.Core.Events.HIDDEN, this.onBlur, this);
			scene.events.off("zone:tap", this.onZoneTap, this);
			scene.input.off("pointerdown", this.onDesktopDown, this);
			scene.input.off("pointerup", this.onDesktopClick, this);
			this.cancel();
		});
	}

	/** The marker is world-space and created after attachGameplay's UI-camera snapshot. */
	get gameObjects(): Phaser.GameObjects.GameObject[] {
		return [this.marker];
	}

	/** A moving NPC can change obstacles without changing the body count. */
	invalidateGrid() { this.grid = null; }

	private ensureGrid(): NavGrid {
		const bodies = [...this.scene.physics.world.staticBodies] as Phaser.Physics.Arcade.StaticBody[];
		if (this.grid && bodies.length === this.gridBodyCount) return this.grid;
		const b = this.scene.physics.world.bounds;
		this.gridRects = bodies.map((s) => ({ x: s.x, y: s.y, width: s.width, height: s.height }));
		this.grid = buildGrid({ x: b.x, y: b.y, width: b.width, height: b.height }, this.gridRects, this.bodySize());
		this.gridBodyCount = bodies.length;
		return this.grid;
	}

	private bodySize(): { width: number; height: number } {
		const body = this.frankie().body as Phaser.Physics.Arcade.Body | undefined;
		return { width: body?.width ?? 28, height: body?.height ?? 14 };
	}

	private onBlur() {
		this.downWhilePaused = true;
		this.cancel();
	}

	private onDesktopDown(_pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) {
		this.downWhilePaused = this.isPaused() || currentlyOver.some(isScreenUI);
	}

	private onDesktopClick(pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) {
		if (this.downWhilePaused) return;
		if (pointer.getDuration() > 350 || Math.hypot(pointer.x - pointer.downX, pointer.y - pointer.downY) > 8) return;
		if (currentlyOver.some(isScreenUI)) return;
		this.onTap(pointer);
	}

	private onTap(pointer: Phaser.Input.Pointer) {
		if (this.isPaused()) return;
		if (this.scene.time.now - this.zoneTapAt < AFTER_ZONE_TAP_IGNORE_MS) return;
		const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
		// A tap near a door goes through it.
		const door = this.getDoors().find((d) => Math.hypot(d.x - world.x, d.y - world.y) <= Math.max(DOOR_TAP_PX, d.radius + 12));
		if (door) {
			const push = FACING_VECTORS[door.enterFacing ?? ""] ?? null;
			this.moveTo(door.x, door.y, () => this.pushThrough(push ?? { x: 0, y: -1 }));
			return;
		}
		// A tap on the floor inside a zone's reach counts as a tap on the thing.
		const zone = this.interactions.zoneContaining(world.x, world.y);
		if (zone) {
			this.moveTo(zone.x, zone.y, () => {
				if (this.interactions.nearestId() === zone.id) zone.onInteract();
			});
			return;
		}
		this.moveTo(world.x, world.y, null);
	}

	private pushThrough(v: { x: number; y: number }) {
		this.pushVector = v;
		this.pushUntil = this.scene.time.now + DOOR_PUSH_MS;
	}

	private onZoneTap(zone: InteractionZone) {
		if (this.isPaused() || this.scene.sys.game.device.input.touch) return;
		this.zoneTapAt = this.scene.time.now;
		this.moveTo(zone.x, zone.y, () => {
			if (this.interactions.nearestId() === zone.id) zone.onInteract();
		});
	}

	moveTo(x: number, y: number, onArrive: (() => void) | null) {
		const f = this.frankie();
		const raw = findPath(this.ensureGrid(), { x: f.x, y: f.y }, { x, y });
		if (!raw || raw.length === 0) {
			this.cancel();
			return;
		}
		// String-pull the cell path: A* hands back a waypoint per 8px cell, and a diagonal hop
		// between two of them 8px apart is exactly the kind of corner his turning circle overshoots.
		// Straight legs between the corners he must actually round are approached head-on.
		const path = smoothPath({ x: f.x, y: f.y }, raw, this.gridRects, this.bodySize());
		this.path = path;
		this.onArrive = onArrive;
		this.lastProgressAt = this.scene.time.now;
		this.lastDist = Infinity;
		const end = path[path.length - 1];
		this.marker.setPosition(end.x, end.y).setVisible(true).setScale(1.4).setAlpha(1);
		this.scene.tweens.add({ targets: this.marker, scale: 1, duration: 180, ease: "Back.easeOut" });
	}

	cancel() {
		this.pushVector = null;
		// Always clear the vector: update() empties the path before it calls this on arrival, and a
		// vector left behind walked him straight past the target and along the next wall.
		setTouchVector(this.scene, null);
		this.path = [];
		this.onArrive = null;
		this.marker.setVisible(false);
	}

	get active(): boolean {
		return this.path.length > 0;
	}

	/** Call every frame while the world is running. `stickActive` is the joystick being dragged. */
	update(stickActive: boolean) {
		if (this.pushVector) {
			if (stickActive || this.keys().some((k) => k?.isDown) || this.scene.time.now > this.pushUntil) {
				this.pushVector = null;
				setTouchVector(this.scene, null);
			} else {
				setTouchVector(this.scene, this.pushVector);
			}
			return;
		}
		if (!this.path.length) return;
		if (stickActive || this.keys().some((k) => k?.isDown)) {
			this.cancel();
			return;
		}
		const f = this.frankie();
		const next = this.path[0];
		const dx = next.x - f.x;
		const dy = next.y - f.y;
		const dist = Math.hypot(dx, dy);
		const last = this.path.length === 1;
		const body = f.body as Phaser.Physics.Arcade.Body | undefined;
		const v = body?.velocity;
		const passed = !!v && dist <= WAYPOINT_PASSED_PX && (v.x !== 0 || v.y !== 0) && dx * v.x + dy * v.y < 0;
		if (dist <= WAYPOINT_REACHED_PX || passed || (!last && dist <= WAYPOINT_REACHED_PX * 2 && this.lastDist < dist)) {
			this.path.shift();
			this.lastDist = Infinity;
			if (!this.path.length) {
				const arrive = this.onArrive;
				this.cancel();
				arrive?.();
			}
			return;
		}
		if (dist < this.lastDist - 0.5) {
			this.lastDist = dist;
			this.lastProgressAt = this.scene.time.now;
		} else if (this.scene.time.now - this.lastProgressAt > STALL_MS) {
			// Jammed on something the grid didn't know about (a hen, a moving cart). Give up
			// cleanly rather than pushing into it forever; on the last leg, still interact if he
			// is close enough for the zone.
			const arrive = this.onArrive;
			this.cancel();
			if (last) arrive?.();
			return;
		}
		setTouchVector(this.scene, { x: dx / dist, y: dy / dist });
	}
}
