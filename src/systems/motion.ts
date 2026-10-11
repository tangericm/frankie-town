import Phaser from "phaser";
import { reducedMotion } from "./juice";

/**
 * The one motion-token module every panel in the game reads from (docs/research/2026-09-15-ui-
 * revamp.md §3.4 item 6, and the mobile-ux research's motion-ratio system): fixed durations and
 * eases instead of each panel picking its own ad hoc numbers, so "snappy here, sluggish there"
 * cannot happen by construction. `openPanel`/`closePanel` are the shared entry/exit animation
 * every panel (dialogue, journal, settings) now calls instead of hand-rolling a tween -- both
 * collapse to an instant state change under reduced motion, per juice.ts's rule that reduced
 * motion trims decoration but never removes the underlying state change.
 */
export const MOTION = {
	duration: {
		/** A panel springing open (dialogue, journal, settings). */
		panelOpen: 300,
		/** A panel closing -- faster than it opened, so it reads as responsive rather than symmetric
		 * (72technologies' close-at-2/3-open-duration rule; a hair faster still here). */
		panelClose: 200,
		/** A badge/portrait pop -- the journal's per-row reveal, the dialogue portrait's speaker-
		 * change pop. */
		badge: 160,
		/** A button's press-down feel (not currently tweened anywhere -- makeButton's press is an
		 * instant scale snap -- but kept here as the one number if a future press ever animates). */
		press: 90,
		/** Per-item delay step for a staggered list reveal (journal rows). */
		stagger: 40,
		/** Ceiling on total stagger delay, however many items -- a 20-row list must still finish
		 * revealing in under a third of a second. */
		staggerCap: 300,
	},
	ease: {
		/** Every panel/badge open: a small overshoot-and-settle, not a linear or pure decelerate. */
		open: "Back.easeOut",
		/** Every panel close: accelerate out, no overshoot -- reads as "get out of the way". */
		close: "Quad.easeIn",
	},
} as const;

/** Per-item delay for a staggered reveal (journal rows): `index * stagger`, capped at
 * `staggerCap` so a long list never takes more than that to finish revealing. */
export function staggerDelay(index: number): number {
	return Math.min(index * MOTION.duration.stagger, MOTION.duration.staggerCap);
}

/** What `openPanel` animates from -- omit a field to leave that property alone (e.g. no `y` means
 * no slide, just whatever scale/alpha are given). */
export interface PanelFrom {
	/** Starting scale; tweens to 1. */
	scale?: number;
	/** Starting alpha; tweens to 1. */
	alpha?: number;
	/** Starting offset added to the target's CURRENT y (e.g. +24 slides up from 24px below rest);
	 * tweens back to the target's current y. The target must already be positioned at its resting
	 * y before this is called (callers lay out/position first, then open). */
	y?: number;
}

/** The minimal shape `openPanel`/`closePanel` need -- duck-typed rather than pulling in Phaser's
 * `Transform`/`Alpha` component interfaces, which `Container` doesn't fully satisfy (it carries
 * its own simpler alpha model, not the per-corner `Alpha` component's). Every panel-ish container
 * or graphics object in the game already has all of these. */
interface Panelish {
	x: number;
	y: number;
	setScale(scale: number): Panelish;
	setAlpha(alpha: number): Panelish;
	setY(y: number): Panelish;
}

/**
 * Springs `target` open: overshoot-and-settle scale/alpha (and an optional y-slide) over
 * `panelOpen` ms. Does not touch `.visible` -- callers show the object themselves first (so the
 * "from" values apply to something already on screen for this same frame, with no flash of the
 * old state). Collapses to an instant rest state under reduced motion (OS preference or the
 * in-game toggle -- see juice.ts).
 */
export function openPanel(scene: Phaser.Scene, target: Panelish, from: PanelFrom = {}): void {
	const restY = target.y;
	scene.tweens.killTweensOf(target);
	if (reducedMotion(scene)) {
		target.setScale(1).setAlpha(1).setY(restY);
		return;
	}
	target.setScale(from.scale ?? 1).setAlpha(from.alpha ?? 1);
	if (from.y) target.setY(restY + from.y);
	scene.tweens.add({
		targets: target,
		scale: 1,
		alpha: 1,
		...(from.y ? { y: restY } : {}),
		duration: MOTION.duration.panelOpen,
		ease: MOTION.ease.open,
	});
}

/**
 * Closes `target`: an accelerating scale/alpha exit over `panelClose` ms (faster than
 * `openPanel`'s entrance), then calls `onDone` -- callers hide the object and/or flip whatever
 * state the close represents there, not here, since this module owns motion only. Restores scale
 * to 1 before calling `onDone` so the object is not left shrunk the next time it opens. Collapses
 * to an instant close under reduced motion (alpha 0, `onDone` called immediately).
 */
export function closePanel(scene: Phaser.Scene, target: Panelish, onDone?: () => void): void {
	scene.tweens.killTweensOf(target);
	if (reducedMotion(scene)) {
		target.setScale(1).setAlpha(0);
		onDone?.();
		return;
	}
	scene.tweens.add({
		targets: target,
		scale: 0.94,
		alpha: 0,
		duration: MOTION.duration.panelClose,
		ease: MOTION.ease.close,
		onComplete: () => {
			target.setScale(1);
			onDone?.();
		},
	});
}
