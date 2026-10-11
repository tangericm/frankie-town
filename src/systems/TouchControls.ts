import { isScreenUI } from "./uiInput";
import Phaser from "phaser";
import { DialogueBox } from "./DialogueBox";
import type { InteractionManager } from "./InteractionManager";
import { setTouchVector } from "./playerMovement";

const MAX_RADIUS = 48;
const DEADZONE = 8;

/**
 * The player's joystick-side preference (Settings > Joystick side): which half of the screen a
 * touch is allowed to START a drag stick in. `null` -- the true default, and what every existing
 * player already has -- means "either half", i.e. today's free-floating behaviour is completely
 * unchanged; only an explicit "left" or "right" choice restricts where a drag can begin (the
 * other half stays free for TapMove's tap-to-walk/interact). A short tap still works everywhere
 * regardless of this setting -- only the drag-start gate cares about it.
 */
export type JoystickSide = "left" | "right" | null;
/** The order Settings' single toggle button cycles through, starting from the true default. */
export const JOYSTICK_SIDES: JoystickSide[] = [null, "left", "right"];
export function nextJoystickSide(current: JoystickSide): JoystickSide {
	return JOYSTICK_SIDES[(JOYSTICK_SIDES.indexOf(current) + 1) % JOYSTICK_SIDES.length];
}
export function joystickSideLabel(side: JoystickSide): string {
	return side === "left" ? "Left" : side === "right" ? "Right" : "Both";
}
const JOYSTICK_SIDE_KEY = "frankie:joystickSide";

/** Best-effort localStorage read: private browsing throws on access, not just on write. */
function readStoredJoystickSide(): JoystickSide {
	try {
		const raw = window.localStorage.getItem(JOYSTICK_SIDE_KEY);
		return raw === "left" || raw === "right" ? raw : null;
	} catch {
		return null;
	}
}

export function getJoystickSide(game: Phaser.Game): JoystickSide {
	try {
		const cached = game.registry.get(JOYSTICK_SIDE_KEY) as JoystickSide | undefined;
		if (cached !== undefined) return cached;
	} catch {
		// No registry in this environment (a unit-test stub, say) -- fall through to the default.
	}
	const stored = readStoredJoystickSide();
	try {
		game.registry.set(JOYSTICK_SIDE_KEY, stored);
	} catch {
		// Ditto.
	}
	return stored;
}

export function setJoystickSide(game: Phaser.Game, side: JoystickSide) {
	game.registry.set(JOYSTICK_SIDE_KEY, side);
	try {
		if (side) window.localStorage.setItem(JOYSTICK_SIDE_KEY, side);
		else window.localStorage.removeItem(JOYSTICK_SIDE_KEY);
	} catch {
		// Storage unavailable. The setting still applies for this session; it just won't persist.
	}
}

export class TouchControls {
	private scene: Phaser.Scene;
	private dialogueBox: DialogueBox;
	private active = false;
	private base: Phaser.GameObjects.Arc;
	private nub: Phaser.GameObjects.Arc;
	private pointerId: number | null = null;
	private origin = { x: 0, y: 0 };
	/** Set once the finger has left the deadzone: from then on it is a drag, not a tap. */
	private dragging = false;
	private downAt = 0;
	/** Whether THIS touch is allowed to become a drag stick at all, decided once at pointerdown
	 * from the joystick-side setting. True whenever that setting is "either half" (the default) or
	 * the touch started on the permitted half; a tap still works either way (see onPointerUp). */
	private allowDragHere = true;

	constructor(scene: Phaser.Scene, dialogueBox: DialogueBox, private interactions?: InteractionManager) {
		this.scene = scene;
		this.dialogueBox = dialogueBox;
		// Scene instances are reused across scene.start(), and so is anything parked on them -- a
		// stick vector left behind by the previous visit would drive Frankie the instant this scene
		// came back up. Clear on the way in and on the way out (see TOUCH_VECTOR_PROP).
		setTouchVector(scene, null);
		scene.game.events.on(Phaser.Core.Events.BLUR, this.cancel, this);
		scene.game.events.on(Phaser.Core.Events.HIDDEN, this.cancel, this);
		scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.cancel();
			scene.game.events.off(Phaser.Core.Events.BLUR, this.cancel, this);
			scene.game.events.off(Phaser.Core.Events.HIDDEN, this.cancel, this);
			scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
		});
		// `origin` is in screen space, and nothing else invalidates it. Rotating the phone -- or, far
		// more commonly, the URL bar collapsing mid-drag -- resizes the viewport underneath a held
		// thumb and can leave the origin off the new canvas entirely: the stick renders out of view
		// while every reachable point sits on one side of it, so Frankie walks off in one direction
		// and cannot be steered. Re-centre on the finger instead, which is where a floating stick's
		// origin is supposed to be anyway.
		scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
		this.base = scene.add.circle(0, 0, MAX_RADIUS, 0xffffff, 0.15).setScrollFactor(0).setDepth(9800).setVisible(false);
		this.nub = scene.add.circle(0, 0, MAX_RADIUS * 0.4, 0xffffff, 0.35).setScrollFactor(0).setDepth(9800).setVisible(false);

		if (!scene.sys.game.device.input.touch) return;

		scene.input.on("pointerdown", this.onPointerDown, this);
		scene.input.on("pointermove", this.onPointerMove, this);
		scene.input.on("pointerup", this.onPointerUp, this);
		scene.input.on("pointerupoutside", this.onPointerUp, this);
	}

	/** The objects attachGameplay hides from the world/zoomed camera. */
	get gameObjects(): Phaser.GameObjects.Arc[] {
		return [this.base, this.nub];
	}

	/** A cancelled browser gesture must never resume movement when the tab comes back. */
	cancel() {
		this.active = false;
		this.dragging = false;
		this.pointerId = null;
		this.base.setVisible(false);
		this.nub.setVisible(false);
		setTouchVector(this.scene, null);
	}

	private onResize() {
		if (!this.active) return;
		const pointer = this.scene.input.activePointer;
		this.origin = { x: pointer.x, y: pointer.y };
		this.base.setPosition(pointer.x, pointer.y);
		this.nub.setPosition(pointer.x, pointer.y);
		// Zero until the thumb moves again: the finger is now sitting exactly on the new origin, and
		// carrying the old heading across a resize is what made this feel like a runaway.
		setTouchVector(this.scene, null);
	}

	private onPointerDown(pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) {
		if (this.scene.physics.world.isPaused || currentlyOver.some(isScreenUI)) this.interactions?.consumePointer(pointer);
		if (this.scene.data.get("hud:modal")) return;
		if (this.dialogueBox.isActive()) {
			this.interactions?.consumePointer(pointer);
			this.dialogueBox.advance();
			return;
		}
		if (this.scene.physics.world.isPaused) return;
		// UI owns its gesture. World objects stay draggable; InteractionManager accepts only
		// a short pointerup, so dragging across an NPC never starts a conversation.
		if (currentlyOver.some(isScreenUI)) return;
		this.pointerId = pointer.id;
		this.origin = { x: pointer.x, y: pointer.y };
		this.active = true;
		this.dragging = false;
		this.downAt = pointer.downTime;
		const side = getJoystickSide(this.scene.game);
		const half = this.scene.scale.width / 2;
		this.allowDragHere = side === null || (side === "left" ? pointer.x < half : pointer.x >= half);
		// Only a drag reveals the stick. A short touch is reserved for interactions and hints.
		this.base.setPosition(pointer.x, pointer.y).setVisible(false);
		this.nub.setPosition(pointer.x, pointer.y).setVisible(false);
	}

	/** Whether a drag is in progress right now (TapMove cancels its path when it is). */
	get isDragging(): boolean {
		return this.active && this.dragging;
	}

	private onPointerMove(pointer: Phaser.Input.Pointer) {
		if (!this.active || pointer.id !== this.pointerId) return;
		// This touch started on the half the joystick-side setting reserves for the OTHER half --
		// never show the stick or drive movement from it, but keep tracking the pointer (via
		// `active`/`pointerId`) so a short release still reaches onPointerUp's tap handling.
		if (!this.allowDragHere) return;
		const dx = pointer.x - this.origin.x;
		const dy = pointer.y - this.origin.y;
		const raw = Math.hypot(dx, dy);
		if (!this.dragging && raw >= DEADZONE) {
			this.dragging = true;
			this.base.setVisible(true);
			this.nub.setVisible(true);
		}
		const dist = Math.min(raw, MAX_RADIUS);
		const angle = Math.atan2(dy, dx);
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		this.nub.setPosition(this.origin.x + cos * dist, this.origin.y + sin * dist);
		// Radial deadzone, and the stick's true angle handed straight through. The previous
		// version thresholded each axis against DEADZONE separately, which is a *square*
		// deadzone: a drag due east with 9px of thumb wobble tripped the vertical axis too, and
		// the resulting pair of booleans became an exact 45-degree diagonal. That is what made
		// off-axis movement snap to eight headings and flip facing on the way.
		setTouchVector(this.scene, raw < DEADZONE ? null : { x: cos, y: sin });
	}

	private onPointerUp(pointer: Phaser.Input.Pointer) {
		if (pointer.id !== this.pointerId) return;
		const wasTap = !this.dragging && pointer.upTime - this.downAt < 350;
		this.active = false;
		this.dragging = false;
		this.pointerId = null;
		this.base.setVisible(false);
		this.nub.setVisible(false);
		setTouchVector(this.scene, null);
		if (wasTap) this.scene.events.emit("touch:tap", pointer);
	}
}
