/**
 * The project's UI color system -- one place to change instead of hunting hex literals through
 * DialogueBox/JournalUI/SettingsUI/InteractionManager/SceneTransition/Title/Preload, which had
 * each grown their own near-duplicate cream/tan/brown values independently.
 *
 * "Hearth & Parchment" roles (2026-09-15 UI revamp, docs/research/2026-09-15-ui-revamp.md §3.1):
 * cream-family panels (`panel`/`panelLight`) for short in-world reading (dialogue, journal,
 * toasts); walnut (`panelDark`) for chrome and modal sheets (settings, title CTA); every panel
 * gets a double line (`border` outer, `borderLight` inner bevel) and a hard 2px shadow
 * (`shadow`); `accent` never fills a large area. Replaces the old
 * cream/creamLight/tan/tanMuted/tanPale/espresso/espressoDark/muted role names -- see the
 * `LEGACY` aliases below for the only two files still allowed to reference the old names.
 *
 * Two exports per role: a Phaser numeric hex (Graphics fills/strokes, tints) and a CSS string
 * (Text color/stroke options) -- kept in sync by construction via NUM_TO_CSS, not duplicated by
 * hand.
 */

const NUM = {
	/** Dialogue/journal fill -- cream-family panels for short in-world reading. */
	panel: 0xecd9b6,
	/** Selected row / inner highlight -- lighter than `panel`, and the text colour used on top of
	 * `panelDark` walnut chrome. */
	panelLight: 0xfaf0d8,
	/** Walnut -- name plates, section headers, the settings sheet, the title CTA. Dark and light
	 * chrome belong to one family: this pairs with `panelLight` text/highlights. */
	panelDark: 0x6b4626,
	/** Outer line, on every panel. */
	border: 0x4a2f1c,
	/** Inner bevel line, one pixel inside `border`. */
	borderLight: 0xc99a5b,
	/** Body/heading text -- 10.5:1 against `panel`. */
	text: 0x3a2415,
	/** Secondary/de-emphasized text -- 5.3:1 against `panel`. */
	textMuted: 0x6b5232,
	/** Terracotta -- interactive state only (CTAs, selected/active state, highlight badges), never
	 * a large fill. Text on it is 4.5:1. */
	accent: 0xe0703a,
	/** Pressed state, and accent-toned text/glyphs on `panel` that need to read as "accent" without
	 * the full saturation of `accent` itself. */
	accentDark: 0xa8461e,
	/** Checklist ticks, correct memory rings. */
	success: 0x4f7a37,
	/** Wrong answers. */
	danger: 0xa83a2e,
	/** Locked rows, faded/disabled chrome. */
	disabled: 0xb7a488,
	/** Hard 2px panel drop-shadow; also the one "beyond the world" colour (scene void, camera
	 * background) and the stroke colour behind text floating over the scene with no panel under
	 * it. */
	shadow: 0x2a1a10,
} as const;

const LEGACY = {
	/** Alias of `danger` -- the translation-gag "bumper" line's loud color is a one-off joke
	 * effect, not a general UI accent, so it is kept as a distinct name even though it now shares
	 * `danger`'s hex. */
	gagRed: NUM.danger,
	/** Legacy role names, kept only so src/scenes/Title.ts and src/systems/titleLogo.ts (owned by
	 * another agent for this revamp and not to be hand-edited here) keep compiling unchanged.
	 * New code must use the roles above (`panelLight`, `disabled`, `shadow`) instead -- do not
	 * add new usages of these three. */
	creamLight: NUM.panelLight,
	tanPale: NUM.disabled,
	espressoDark: NUM.shadow,
} as const;

const ALL = { ...NUM, ...LEGACY };

function toCss(hex: number): string {
	return `#${hex.toString(16).padStart(6, "0")}`;
}

export const PALETTE = {
	...ALL,
	css: Object.fromEntries(Object.entries(ALL).map(([k, v]) => [k, toCss(v)])) as Record<keyof typeof ALL, string>,
};
