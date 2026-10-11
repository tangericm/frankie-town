import Phaser from "phaser";

// title-hero-tall is the 2026-09-15 title painting: the original 4:3 street (400x300) outpainted
// upward into sky and downward into road, 400x904, plus the grocer's window repainted (see
// scripts/pixellab/outpaint-title-hero.mjs). Tall enough that a phone in portrait is COVERED --
// no letterbox band above or below -- with only a little sky and road cropped. A landscape or
// desktop window is the opposite shape: the painting is fitted so the buildings and the road in
// front of them fill the height, centred, and the street continues either side with further
// copies of the painting fading into the edges -- a row of shops rather than a picture on a slab.
// (Row-by-row edge-colour bands were tried first and read as stripes.)
const TEXTURE = "title-hero-tall";
const PAINT_W = 400;
const PAINT_H = 904;
/** The rows to keep on a landscape screen: from a little sky above the roofs down to the road. */
const LANDSCAPE_FIT_ROWS = 600;
/** Image-space landmarks used by Title for placing things on the painting. */
export const TITLE_ART = {
	/** Sky, well above the rooftops (roofs begin ~y290): where the logo sits. */
	logoY: 150,
	/** The pavement Frankie trots along (feet on this row). */
	pavementY: 556,
	/** The road, where the buttons and the pigeon live. */
	roadY: 640,
	roadY2: 712,
	/** Vertical centre of the building band, kept near the screen's own centre. */
	focusY: 430,
	width: PAINT_W,
	height: PAINT_H,
} as const;

export interface HeroLayout {
	/** Screen y of the painting's top edge (may be negative when cropped). */
	top: number;
	/** Screen y of the painting's bottom edge. */
	bottom: number;
	/** Screen x of the painting's left edge. */
	left: number;
	scale: number;
	/** Screen y for the logo, on the sky. */
	logoY: number;
	/** Convert a point in painting pixels to screen pixels. */
	toScreen(x: number, y: number): { x: number; y: number };
	/** Whether side bands were drawn (landscape); phone-portrait covers the screen instead. */
	framed: boolean;
}

/** Adds the title painting, covering the viewport on portrait screens and framed with its own edge
 * colours on landscape ones. Returns the placement so callers can anchor UI to the art, or null if
 * the texture isn't loaded (callers fall back to plain text). */
export function layoutHeroBackground(scene: Phaser.Scene, w: number, h: number): HeroLayout | null {
	if (!scene.textures.exists(TEXTURE)) return null;
	const portrait = w / h < 0.8;
	const scale = portrait ? Math.max(w / PAINT_W, h / PAINT_H) : h / LANDSCAPE_FIT_ROWS;
	const dispW = PAINT_W * scale;
	const dispH = PAINT_H * scale;
	const left = (w - dispW) / 2;
	// Keep the building band near the screen's centre, then clamp so the painting still covers
	// the full height (there is always more painting than screen vertically).
	let top = h * 0.47 - TITLE_ART.focusY * scale;
	top = Math.min(0, Math.max(h - dispH, top));

	const framed = !portrait && left > 0;
	if (framed) {
		// The street continues: more copies of the painting either side, at the same scale and row.
		for (let i = 1; left - i * dispW < w && i < 6; i++) {
			if (left - i * dispW + dispW > 0) scene.add.image(left - i * dispW, top, TEXTURE).setOrigin(0, 0).setScale(scale);
			if (left + i * dispW < w) scene.add.image(left + i * dispW, top, TEXTURE).setOrigin(0, 0).setScale(scale);
		}
	}
	scene.add.image(left, top, TEXTURE).setOrigin(0, 0).setScale(scale);
	if (framed) {
		// Fade the repeats into the edges so the eye stays on the original in the middle.
		const fade = Math.max(80, left * 0.95);
		const v = scene.add.graphics();
		v.fillGradientStyle(0x2a1a10, 0x2a1a10, 0x2a1a10, 0x2a1a10, 0.7, 0, 0.7, 0);
		v.fillRect(0, 0, fade, h);
		v.fillGradientStyle(0x2a1a10, 0x2a1a10, 0x2a1a10, 0x2a1a10, 0, 0.7, 0, 0.7);
		v.fillRect(w - fade, 0, fade, h);
	}
	const toScreen = (x: number, y: number) => ({ x: left + x * scale, y: top + y * scale });
	// On landscape the sky above the logo row is cropped away; keep the logo clear of the top edge.
	const logoY = Math.max(72, toScreen(0, TITLE_ART.logoY).y);
	return { top, bottom: top + dispH, left, scale, logoY, toScreen, framed };
}
