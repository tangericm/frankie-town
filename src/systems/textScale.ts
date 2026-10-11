import Phaser from "phaser";

/**
 * The player's text-size preference: a multiplier applied to DialogueBox's and JournalUI's own
 * font sizes, in the same registry+localStorage shape as cameraFit's zoom scale (see
 * `getZoomScale`/`setZoomScale`) -- a small tiny module rather than folding this into either
 * consumer, since both read it.
 */
export const TEXT_SCALES = [1, 1.25, 1.5] as const;
export type TextScale = (typeof TEXT_SCALES)[number];
export const DEFAULT_TEXT_SCALE: TextScale = 1;
const TEXT_SCALE_KEY = "frankie:textScale";
/** Fired on `game.registry.events` (as `changedata-<this>`) whenever `setTextScale` changes an
 * already-primed value -- DialogueBox and JournalUI each subscribe to that to re-layout live,
 * without either needing a direct reference to SettingsUI or to each other. */
export const TEXT_SCALE_CHANGED = `changedata-${TEXT_SCALE_KEY}`;

function isTextScale(value: number): value is TextScale {
	return (TEXT_SCALES as readonly number[]).includes(value);
}

/** Best-effort localStorage read: private browsing throws on access, not just on write. */
function readStoredTextScale(): TextScale | null {
	try {
		const raw = window.localStorage.getItem(TEXT_SCALE_KEY);
		const value = raw === null ? NaN : Number(raw);
		return isTextScale(value) ? value : null;
	} catch {
		return null;
	}
}

export function getTextScale(game: Phaser.Game): TextScale {
	const cached = game.registry.get(TEXT_SCALE_KEY) as number | undefined;
	if (typeof cached === "number" && isTextScale(cached)) return cached;
	const stored = readStoredTextScale() ?? DEFAULT_TEXT_SCALE;
	game.registry.set(TEXT_SCALE_KEY, stored);
	return stored;
}

export function setTextScale(game: Phaser.Game, scale: TextScale) {
	game.registry.set(TEXT_SCALE_KEY, scale);
	try {
		window.localStorage.setItem(TEXT_SCALE_KEY, String(scale));
	} catch {
		// Storage unavailable. The setting still applies for this session; it just won't persist.
	}
}
