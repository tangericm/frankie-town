import Phaser from "phaser";

/** The four directions Frankie's animation keys are named after. */
export type Facing = "north" | "south" | "east" | "west";

/** A movement direction for the current frame. Length is 0 (no input) or 1 (moving). */
export interface MoveVector {
	x: number;
	y: number;
}

/**
 * How far the off-axis component has to beat the on-axis one before the sprite turns.
 *
 * A thumb held near a diagonal wanders a few degrees either side of the 45-degree tie line every
 * frame. Without a band, that wander alternates the pick and the sprite flips continuously. 1.35
 * is roughly a 9-degree band on each side of the diagonal: wide enough to swallow thumb noise,
 * narrow enough that a deliberate turn still reads as instant.
 */
const FACING_HYSTERESIS = 1.35;

/**
 * Where TouchControls parks its current stick vector for the scenes' update() to read back.
 *
 * A scene property rather than a constructor argument because the generated scene files are
 * rewritten wholesale by the Python builders and cannot hold a reference to something
 * attachGameplay owns. Same escape hatch attachGameplay already uses for `__interactions`.
 *
 * IMPORTANT: Phaser reuses Scene *instances* across scene.start() -- it calls shutdown() and then
 * create() on the same object rather than constructing a new one -- so anything parked here
 * outlives the scene that wrote it. Holding the stick while a door fires meant the departing scene
 * kept a non-zero vector forever: on the next visit, readMoveVector handed it straight back and
 * Frankie walked off under his own steam, back through the door he had just come out of, looping
 * between the two rooms with no input and no way to break out. TouchControls clears it on both
 * create and shutdown for exactly this reason.
 */
const TOUCH_VECTOR_PROP = "__touchVector";

export function setTouchVector(scene: Phaser.Scene, v: MoveVector | null) {
	(scene as unknown as Record<string, MoveVector | null>)[TOUCH_VECTOR_PROP] = v;
}

function getTouchVector(scene: Phaser.Scene): MoveVector | null {
	return (scene as unknown as Record<string, MoveVector | null>)[TOUCH_VECTOR_PROP] ?? null;
}

/**
 * This frame's movement direction, with a live touch stick taking priority over the keyboard.
 *
 * Touch returns the stick's real angle, so a 20-degree drag walks at 20 degrees instead of
 * snapping to the nearest of eight headings. It is normalized to full length rather than left
 * analog on purpose: desktop WASD has always moved at one speed, and matching that feel is the
 * point of routing both inputs through here. (If variable walk speed is ever wanted, drop the
 * normalize in TouchControls and scale MOVE_SPEED by the magnitude at the call site -- scaling
 * acceleration alone will not do it, since MOVE_ACCEL exceeds MOVE_DRAG and every non-zero
 * push therefore still coasts up to maxSpeed.)
 *
 * Returns a zero vector when there is no input at all.
 */
export function readMoveVector(
	scene: Phaser.Scene,
	cursors: Phaser.Types.Input.Keyboard.CursorKeys,
	wasd: Record<string, Phaser.Input.Keyboard.Key>
): MoveVector {
	const touch = getTouchVector(scene);
	if (touch) return touch;
	const left = cursors.left.isDown || wasd.A.isDown;
	const right = cursors.right.isDown || wasd.D.isDown;
	const up = cursors.up.isDown || wasd.W.isDown;
	const down = cursors.down.isDown || wasd.S.isDown;
	let x = 0;
	let y = 0;
	if (left) x = -1;
	else if (right) x = 1;
	if (up) y = -1;
	else if (down) y = 1;
	if (x !== 0 && y !== 0) {
		x *= Math.SQRT1_2;
		y *= Math.SQRT1_2;
	}
	return { x, y };
}

/**
 * Which way the sprite should face for a movement vector, biased toward not turning.
 *
 * The pick this replaces was `Math.abs(vx) > Math.abs(vy)` over components quantized to -1|0|1.
 * On any diagonal that compares 1 > 1, which is false, so every off-axis input fell through to
 * north/south -- Frankie could not face east or west while moving diagonally at all, on any
 * input device. Comparing the real components fixes that; the hysteresis band on top is what
 * keeps a near-45-degree hold from alternating.
 */
const FACINGS: readonly Facing[] = ["north", "south", "east", "west"];

/**
 * Which way Frankie is currently facing, read back off her own animation key.
 *
 * The generated scenes drive her animation from their private `facing` field every frame
 * (`frankie-idle-north`, `frankie-walking-west`, ...), and that key is the only place the value is
 * readable from outside: the scene classes are rewritten wholesale by the Python builders, so a
 * hand-added getter would not survive the next rebuild (Street.ts already carries one such edit).
 */
export function facingFromAnimation(sprite: Phaser.GameObjects.Sprite, fallback: Facing = "south"): Facing {
	const key = sprite.anims?.currentAnim?.key ?? "";
	return FACINGS.find((facing) => key.endsWith(`-${facing}`)) ?? fallback;
}

export function pickFacing(v: MoveVector, current: Facing): Facing {
	const ax = Math.abs(v.x);
	const ay = Math.abs(v.y);
	if (ax === 0 && ay === 0) return current;
	const horizontal: Facing = v.x < 0 ? "west" : "east";
	const vertical: Facing = v.y < 0 ? "north" : "south";
	const facingHorizontal = current === "east" || current === "west";
	// Only the axis already being faced gets the band. Turning off an axis the input no longer
	// has any component on (a pure east walk becoming a pure north one) is not a close call, so
	// it falls through to the plain comparison and switches on the same frame.
	if (facingHorizontal && ax > 0) return ay > ax * FACING_HYSTERESIS ? vertical : horizontal;
	if (!facingHorizontal && ay > 0) return ax > ay * FACING_HYSTERESIS ? horizontal : vertical;
	return ax > ay ? horizontal : vertical;
}
