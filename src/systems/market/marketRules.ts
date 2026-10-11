import type { DialogueLine } from "../DialogueSequencer";
import {
	HEN_IDS,
	MEMORY_ROUNDS,
	PIERRE_DIALOGUE,
	type MarketLaneId,
	type MarketSymbol,
} from "../../data/market.gameplay";

export type { MarketSymbol };

export interface Point {
	x: number;
	y: number;
}

export interface Rect extends Point {
	width: number;
	height: number;
}

export interface GoalRect extends Rect {
	entry: "north" | "south" | "east" | "west";
}

export type HenMode = "idle" | "flee" | "settle" | "homed";

export type MemoryAttempt = { round: number; cursor: number; complete: boolean };
export type MemoryStatus = "accepted" | "round-complete" | "complete" | "replay";
export type MemoryResult = { status: MemoryStatus; attempt: MemoryAttempt };

export interface PierreProgress {
	introduced: boolean;
	hensHomed: number;
	sugarCubes: number;
	hasEggs: boolean;
	hasSugar: boolean;
	/** The cake has been given: Pierre has one new thing to say and says it every time. */
	cakeGiven?: boolean;
}

export function pointInRect(point: Point, rect: Rect): boolean {
	return point.x >= rect.x
		&& point.x <= rect.x + rect.width
		&& point.y >= rect.y
		&& point.y <= rect.y + rect.height;
}

export function fleeVelocity(hen: Point, frankie: Point, speed: number): Point {
	const dx = hen.x - frankie.x;
	const dy = hen.y - frankie.y;
	const distance = Math.hypot(dx, dy);
	const magnitude = Math.abs(speed);
	if (distance === 0) return { x: magnitude, y: 0 };
	return { x: dx / distance * magnitude, y: dy / distance * magnitude };
}

/**
 * Where to steer a hen that is pressed into something and getting nowhere.
 *
 * `fleeVelocity` points straight away from Frankie, which is the right answer right up until that
 * direction is a wall -- then she grinds into it forever, and since Frankie has to stand on the
 * opposite side to push her at all, there is no angle he can approach from that frees her. This
 * returns the tangent to the flee direction (a quarter turn), picking whichever of the two
 * perpendiculars points further into the open space described by `bounds`, so she slides ALONG the
 * obstacle instead of into it and comes off the corner on her own.
 */
export function escapeVelocity(hen: Point, frankie: Point, bounds: Rect, speed: number): Point {
	const away = fleeVelocity(hen, frankie, 1);
	// Both quarter turns of `away`.
	const options = [{ x: -away.y, y: away.x }, { x: away.y, y: -away.x }];
	const centre = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
	const toOpen = { x: centre.x - hen.x, y: centre.y - hen.y };
	const best = options[0].x * toOpen.x + options[0].y * toOpen.y >= options[1].x * toOpen.x + options[1].y * toOpen.y
		? options[0]
		: options[1];
	return { x: best.x * speed, y: best.y * speed };
}

export function nextHenMode(
	mode: HenMode,
	distanceFromFrankie: number,
	panicRadius: number,
	releaseRadius: number,
): HenMode {
	if (mode === "settle" || mode === "homed") return mode;
	if (distanceFromFrankie <= panicRadius) return "flee";
	if (mode === "flee" && distanceFromFrankie < releaseRadius) return "flee";
	return "idle";
}

export function clampPoint(point: Point, bounds: Rect): Point {
	return {
		x: Math.max(bounds.x, Math.min(bounds.x + bounds.width, point.x)),
		y: Math.max(bounds.y, Math.min(bounds.y + bounds.height, point.y)),
	};
}

export function enteredGoal(previous: Point, current: Point, goal: GoalRect): boolean {
	if (pointInRect(previous, goal) || !pointInRect(current, goal)) return false;
	const between = (value: number, start: number, length: number) => value >= start && value <= start + length;

	switch (goal.entry) {
		case "north": {
			if (previous.y >= goal.y || current.y < goal.y) return false;
			const t = (goal.y - previous.y) / (current.y - previous.y);
			return between(previous.x + (current.x - previous.x) * t, goal.x, goal.width);
		}
		case "south": {
			const edge = goal.y + goal.height;
			if (previous.y <= edge || current.y > edge) return false;
			const t = (edge - previous.y) / (current.y - previous.y);
			return between(previous.x + (current.x - previous.x) * t, goal.x, goal.width);
		}
		case "east": {
			const edge = goal.x + goal.width;
			if (previous.x <= edge || current.x > edge) return false;
			const t = (edge - previous.x) / (current.x - previous.x);
			return between(previous.y + (current.y - previous.y) * t, goal.y, goal.height);
		}
		case "west": {
			if (previous.x >= goal.x || current.x < goal.x) return false;
			const t = (goal.x - previous.x) / (current.x - previous.x);
			return between(previous.y + (current.y - previous.y) * t, goal.y, goal.height);
		}
	}
}

export function enterMemorySymbol(attempt: MemoryAttempt, symbol: MarketSymbol): MemoryResult {
	if (attempt.complete) return { status: "complete", attempt: { ...attempt } };

	const sequence = MEMORY_ROUNDS[attempt.round];
	if (!sequence || sequence[attempt.cursor] !== symbol) {
		return {
			status: "replay",
			attempt: { round: attempt.round, cursor: 0, complete: false },
		};
	}

	const cursor = attempt.cursor + 1;
	if (cursor < sequence.length) {
		return { status: "accepted", attempt: { round: attempt.round, cursor, complete: false } };
	}
	if (attempt.round === MEMORY_ROUNDS.length - 1) {
		return { status: "complete", attempt: { round: attempt.round, cursor, complete: true } };
	}
	return {
		status: "round-complete",
		attempt: { round: attempt.round + 1, cursor: 0, complete: false },
	};
}

export function pigeonGapMs(laneWidth: number, playerSpeed: number, marginMs: number): number {
	return Math.ceil(laneWidth / playerSpeed * 1000 + marginMs);
}

export function isPigeonPhaseHazardous(phase: string): boolean {
	return phase === "dart";
}

export function isCartPhaseHazardous(phase: string): boolean {
	return phase === "crossing";
}

export function isLaneCleared(
	collectedCubeIds: ReadonlySet<string> | readonly string[],
	laneId: MarketLaneId,
): boolean {
	return "has" in collectedCubeIds
		? collectedCubeIds.has(laneId)
		: collectedCubeIds.includes(laneId);
}

export function pierreDialogue(progress: PierreProgress): readonly DialogueLine[] {
	if (!progress.introduced) return PIERRE_DIALOGUE.intro;
	if (progress.cakeGiven) return PIERRE_DIALOGUE.afterCake;
	if (progress.hasEggs && progress.hasSugar) return PIERRE_DIALOGUE.complete;
	if (progress.hensHomed >= HEN_IDS.length && !progress.hasEggs) return PIERRE_DIALOGUE.eggsHandoff;
	if (progress.hensHomed < HEN_IDS.length) {
		const hensHomed = Math.max(0, Math.min(progress.hensHomed, PIERRE_DIALOGUE.hens.length - 1));
		return PIERRE_DIALOGUE.hens[hensHomed];
	}
	const sugarCubes = Math.max(0, Math.min(progress.sugarCubes, PIERRE_DIALOGUE.sugar.length - 1));
	return PIERRE_DIALOGUE.sugar[sugarCubes];
}
