import Phaser from "phaser";

/**
 * Bitmap text keeps speaker names, settings and journal labels crisp at small sizes.
 * Use integer scaling to avoid ambiguous glyphs. Dialogue body text uses Nunito.
 */
export const PIXEL_FONT_KEY = "pixel-font";

export interface PixelTextOptions {
	/**
	 * Integer scale on the atlas's own native pixel size (16px) -- never fractional, or the
	 * whole reason for a bitmap font over Text is lost. Pass the player's text-size setting
	 * (`getTextScale(game)`, textScale.ts) directly, or that value times a fixed per-element
	 * multiplier for something meant to read larger (e.g. the continue mark); this always rounds
	 * to a whole number and never below 1x, matching the text-size setting's own mapping rule.
	 */
	scale?: number;
	tint?: number;
	/** 0 = left (default), 1 = centre, 2 = right -- Phaser's own BitmapText alignment enum. */
	align?: 0 | 1 | 2;
}

/** Adds a BitmapText using the shared pixel font, at an integer scale, positioned on whole
 * pixels (nearest-neighbour scaling of a non-integer-positioned glyph still blurs under
 * `pixelArt: true`'s rounding, so this rounds explicitly rather than relying on that alone). */
export function addPixelText(scene: Phaser.Scene, x: number, y: number, text: string, opts: PixelTextOptions = {}): Phaser.GameObjects.BitmapText {
	const bt = scene.add.bitmapText(Math.round(x), Math.round(y), PIXEL_FONT_KEY, text, undefined, opts.align);
	bt.setScale(Math.max(1, Math.round(opts.scale ?? 1)));
	if (opts.tint !== undefined) bt.setTint(opts.tint);
	return bt;
}
