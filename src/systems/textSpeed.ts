import Phaser from "phaser";

/**
 * The player's dialogue text-speed preference (Settings > Text speed): Slow/Normal/Fast, mapped to
 * a fixed characters-per-second rate the typewriter reads directly (docs/research/2026-09-15-ui-
 * revamp.md §3.4 item 1 / mobile-ux research item 3). Same registry+localStorage shape as
 * textScale.ts -- a small sibling module rather than folding this into either DialogueBox or
 * SettingsUI, since only one of them writes it and only the other reads it.
 */
export const TEXT_SPEEDS = ["slow", "normal", "fast"] as const;
export type TextSpeed = (typeof TEXT_SPEEDS)[number];
export const DEFAULT_TEXT_SPEED: TextSpeed = "normal";
/** Characters per second, per the research doc's recommended values. */
export const TEXT_SPEED_CPS: Record<TextSpeed, number> = { slow: 25, normal: 40, fast: 60 };
const TEXT_SPEED_KEY = "frankie:textSpeed";
/** Fired on `game.registry.events` whenever `setTextSpeed` changes an already-primed value -- kept
 * for symmetry with TEXT_SCALE_CHANGED even though the typewriter only reads the value at the
 * start of each page's `typeOut()`, not mid-type. */
export const TEXT_SPEED_CHANGED = `changedata-${TEXT_SPEED_KEY}`;

function isTextSpeed(value: string): value is TextSpeed {
	return (TEXT_SPEEDS as readonly string[]).includes(value);
}

/** Best-effort localStorage read: private browsing throws on access, not just on write. */
function readStoredTextSpeed(): TextSpeed | null {
	try {
		const raw = window.localStorage.getItem(TEXT_SPEED_KEY);
		return raw !== null && isTextSpeed(raw) ? raw : null;
	} catch {
		return null;
	}
}

export function getTextSpeed(game: Phaser.Game): TextSpeed {
	const cached = game.registry.get(TEXT_SPEED_KEY) as string | undefined;
	if (typeof cached === "string" && isTextSpeed(cached)) return cached;
	const stored = readStoredTextSpeed() ?? DEFAULT_TEXT_SPEED;
	game.registry.set(TEXT_SPEED_KEY, stored);
	return stored;
}

export function setTextSpeed(game: Phaser.Game, speed: TextSpeed) {
	game.registry.set(TEXT_SPEED_KEY, speed);
	try {
		window.localStorage.setItem(TEXT_SPEED_KEY, speed);
	} catch {
		// Storage unavailable. The setting still applies for this session; it just won't persist.
	}
}

/** Milliseconds per character for the typewriter, at the given speed. */
export function charDelayMs(speed: TextSpeed): number {
	return 1000 / TEXT_SPEED_CPS[speed];
}
