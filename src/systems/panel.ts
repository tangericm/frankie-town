import Phaser from "phaser";
import { PALETTE } from "./palette";
import { addPixelText } from "./pixelText";

/**
 * The one panel material for the "Hearth & Parchment" revamp
 * (docs/research/2026-09-15-ui-revamp.md §3.1/§3.4): every panel gets a hard 2px drop shadow, a
 * dark outer border, a fill, and a lighter 1px inner bevel line one pixel inside the border --
 * cream family for in-world reading (dialogue, journal), walnut for chrome/modal sheets
 * (settings, name plates). Nothing here reads or writes state; callers own their own Graphics
 * object and call `drawPanel`/`drawButton` again whenever their size changes, the same way they
 * already called `.clear()` + `fillRoundedRect` before this module existed.
 */

export type PanelVariant = "cream" | "walnut";
export type ButtonVariant = "walnut" | "accent" | "cream";
export type ButtonState = "idle" | "pressed" | "disabled";

const CREAM_RADIUS = 8;
const WALNUT_RADIUS = 6;
const BORDER_WIDTH = 2;
const BEVEL_WIDTH = 1;
const SHADOW_OFFSET_Y = 2;

export interface PanelOptions {
	variant?: PanelVariant;
	/** Fill alpha, e.g. for a slightly translucent panel over the world. Default 1. */
	alpha?: number;
}

/**
 * Draws, into `g` at (0,0)-(w,h): a hard 2px shadow (no blur, offset down), the outer 2px
 * border, the fill (`panel` or `panelDark` for the walnut variant), and a 1px inner bevel line
 * one pixel inside the border (`borderLight`, at 0.6 alpha on walnut). Clears `g` first, so
 * callers do not need their own `.clear()` before calling this.
 */
export function drawPanel(g: Phaser.GameObjects.Graphics, w: number, h: number, opts: PanelOptions = {}) {
	const variant = opts.variant ?? "cream";
	const radius = variant === "walnut" ? WALNUT_RADIUS : CREAM_RADIUS;
	const fillColor = variant === "walnut" ? PALETTE.panelDark : PALETTE.panel;
	const fillAlpha = opts.alpha ?? 1;
	const bevelAlpha = variant === "walnut" ? 0.6 : 1;
	paintPanelShape(g, w, h, { radius, fillColor, fillAlpha, bevelAlpha });
}

/** Shared primitive behind both `drawPanel` and `drawButton` -- same four-layer material, just a
 * different fill color and radius depending on caller. */
function paintPanelShape(
	g: Phaser.GameObjects.Graphics,
	w: number,
	h: number,
	opts: { radius: number; fillColor: number; fillAlpha: number; bevelAlpha: number }
) {
	const { radius, fillColor, fillAlpha, bevelAlpha } = opts;
	g.clear();
	// 1. Hard shadow -- flat offset copy of the panel shape, no blur (pixel art has no soft shadows).
	g.fillStyle(PALETTE.shadow, 0.45);
	g.fillRoundedRect(0, SHADOW_OFFSET_Y, w, h, radius);
	// 2. Outer border -- a full-size fill in `border`, with the actual fill inset on top of it,
	// reads identically to a 2px stroke but keeps every corner's border thickness exact at any
	// radius (no stroke-join artifacts at the rounded corners).
	g.fillStyle(PALETTE.border, 1);
	g.fillRoundedRect(0, 0, w, h, radius);
	// 3. Fill, inset by the border width.
	const innerRadius = Math.max(0, radius - BORDER_WIDTH);
	g.fillStyle(fillColor, fillAlpha);
	g.fillRoundedRect(BORDER_WIDTH, BORDER_WIDTH, w - BORDER_WIDTH * 2, h - BORDER_WIDTH * 2, innerRadius);
	// 4. Inner bevel line, one pixel inside the border's inner edge.
	const bevelInset = BORDER_WIDTH + BEVEL_WIDTH;
	const bevelRadius = Math.max(0, radius - bevelInset);
	g.lineStyle(BEVEL_WIDTH, PALETTE.borderLight, bevelAlpha);
	g.strokeRoundedRect(bevelInset + 0.5, bevelInset + 0.5, w - bevelInset * 2 - 1, h - bevelInset * 2 - 1, bevelRadius);
}

function baseFillFor(variant: ButtonVariant): number {
	if (variant === "accent") return PALETTE.accent;
	if (variant === "walnut") return PALETTE.panelDark;
	return PALETTE.panel;
}

/** Darkens a fill for the pressed state -- one generic rule instead of a hand-picked pressed
 * color per variant. */
function pressedShade(hex: number): number {
	return Phaser.Display.Color.IntegerToColor(hex).clone().darken(18).color;
}

/**
 * Same material as `drawPanel`, tuned for a tappable control: `state` picks the fill (idle,
 * darkened for pressed, or flat `disabled`) and radius/bevel follow `variant` the same way a
 * panel's do. Scale/press animation is `makeButton`'s job, not this function's -- this only ever
 * draws the flat art for the given state.
 */
export function drawButton(g: Phaser.GameObjects.Graphics, w: number, h: number, state: ButtonState, variant: ButtonVariant) {
	const radius = variant === "walnut" ? WALNUT_RADIUS : CREAM_RADIUS;
	const base = baseFillFor(variant);
	const fillColor = state === "disabled" ? PALETTE.disabled : state === "pressed" ? pressedShade(base) : base;
	const bevelAlpha = variant === "walnut" ? 0.6 : 1;
	paintPanelShape(g, w, h, { radius, fillColor, fillAlpha: 1, bevelAlpha });
}

export interface MakeButtonOptions {
	width?: number;
	height?: number;
	variant?: ButtonVariant;
	fontSize?: number;
	/** Smooth functional labels; display headings keep the default bitmap face. */
	font?: "pixel" | "body";
	/** Starts disabled (no interaction, `disabled` fill, label at 0.6 alpha). */
	disabled?: boolean;
	/** Starts selected -- draws with an accent fill and a `text`-colored label regardless of
	 * `variant`, for a segmented control's active option. Call `.setSelected()` to change later. */
	selected?: boolean;
	depth?: number;
}

/** A button built from `drawButton`, with the four-state behavior every button in the game should
 * share: idle / pressed (scale 0.94 while the pointer is down, back on up or out) / disabled (no
 * interaction, `disabled` fill, label at 0.6 alpha) / selected (accent fill, `text`-colored
 * label, e.g. the active text-size segment). Still just a Container -- `setSelected`/
 * `setDisabled`/`setLabel` are attached to it (same pattern as the journal tab's `__glyph`) so a
 * caller that needs to react to state changes (SettingsUI's `refresh()`) can, without this
 * module owning any external state itself. */
export interface ButtonHandle extends Phaser.GameObjects.Container {
	setDisabled(disabled: boolean): void;
	setSelected(selected: boolean): void;
	setLabel(text: string): void;
	setFocused(focused: boolean): void;
	activate(): void;
	isDisabled(): boolean;
}

export function makeButton(
	scene: Phaser.Scene,
	x: number,
	y: number,
	label: string,
	onTap: () => void,
	opts: MakeButtonOptions = {}
): ButtonHandle {
	const width = opts.width ?? 96;
	const height = opts.height ?? 36;
	const variant = opts.variant ?? "walnut";
	const fontSize = opts.fontSize ?? 15;

	let disabled = opts.disabled ?? false;
	let selected = opts.selected ?? false;
	let pressed = false;
	let focused = false;

	const bg = scene.add.graphics();
	// A real bitmap font, not Pixelify Sans through canvas Text -- every button's label shares the
	// same crisp rendering the rest of the 2026-09-15 UI revamp uses (docs/research/2026-09-15-ui-
	// revamp.md §3.3). `fontSize` becomes the nearest integer multiple of the atlas's own 16px.
	const scale = Math.max(1, Math.round(fontSize / 16));
	const text = (opts.font === "body"
		? scene.add.text(width / 2, height / 2, label, { fontFamily: "Nunito, sans-serif", fontSize, fontStyle: "bold", color: PALETTE.css.panelLight, resolution: 3, padding: { x: 2, y: 2 } })
		: addPixelText(scene, width / 2, height / 2, label, { scale, align: 1, tint: PALETTE.panelLight })).setOrigin(0.5);
	// The transparent hit rectangle, not the Graphics object -- Graphics has no reliable
	// pointer-in-shape hit test for a rounded rect. Grown to the 44pt minimum tap target
	// (2026-09-15 UI revamp phase 4, mobile-ux research item 13) when the button's own drawn size
	// is smaller -- centred on the button so a visually small control (the zoom +/-, the text-size
	// segments) still keeps its own size but is not hard to hit; never shrunk below the drawn size.
	const MIN_HIT = 44;
	const hitW = Math.max(width, MIN_HIT);
	const hitH = Math.max(height, MIN_HIT);
	const hit = scene.add.rectangle(width / 2, height / 2, hitW, hitH, 0x000000, 0).setInteractive({ useHandCursor: true });

	const container = scene.add.container(x, y, [bg, text, hit]) as ButtonHandle;
	if (opts.depth !== undefined) container.setDepth(opts.depth);

	const redraw = () => {
		const state: ButtonState = disabled ? "disabled" : pressed ? "pressed" : "idle";
		const effectiveVariant: ButtonVariant = disabled ? variant : selected ? "accent" : variant;
		drawButton(bg, width, height, state, effectiveVariant);
		if (focused) { bg.lineStyle(2, PALETTE.accent); bg.strokeRect(-3, -3, width + 6, height + 6); }
		const labelColor = selected && !disabled ? PALETTE.text : PALETTE.panelLight;
		text.setTint(labelColor).setAlpha(disabled ? 0.6 : 1);
		if (disabled) hit.disableInteractive();
		else if (!hit.input?.enabled) hit.setInteractive({ useHandCursor: true });
	};

	hit.on("pointerdown", () => {
		if (disabled) return;
		pressed = true;
		container.setScale(0.94);
		redraw();
	});
	const release = () => {
		if (!pressed) return;
		pressed = false;
		container.setScale(1);
		redraw();
	};
	hit.on("pointerup", () => {
		const wasPressed = pressed;
		release();
		if (wasPressed && !disabled) onTap();
	});
	hit.on("pointerout", release);

	container.setLabel = (t: string) => text.setText(t);
	container.setFocused = (v: boolean) => { focused = v; redraw(); };
	container.activate = () => { if (!disabled) onTap(); };
	container.isDisabled = () => disabled;
	container.setDisabled = (v: boolean) => {
		disabled = v;
		if (!v) pressed = false;
		if (!disabled) container.setScale(pressed ? 0.94 : 1);
		redraw();
	};
	container.setSelected = (v: boolean) => {
		selected = v;
		redraw();
	};

	redraw();
	return container;
}
