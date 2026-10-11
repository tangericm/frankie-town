import Phaser from "phaser";
import { PALETTE } from "./palette";

export interface EmbossedLogo {
	logo: Phaser.GameObjects.Image;
	shadow: Phaser.GameObjects.Image;
	highlight: Phaser.GameObjects.Image;
	haloLayers: Phaser.GameObjects.Image[];
}

/**
 * Draws the "title-logo" texture with a pseudo-emboss (a dark halo offset in every direction, a
 * stronger directional shadow for depth, a faint light highlight for a bevel edge) instead of a
 * flat image. Shared by Preload and Title so the loading screen's logo and the title screen's
 * logo are the same treatment -- they used to diverge (Preload drew it flat, Title embossed it),
 * which read as the logo visibly "un-flattening" the instant loading finished and Title took
 * over. Returns null if the texture isn't loaded yet (callers fall back to plain text).
 */
export function drawEmbossedLogo(scene: Phaser.Scene, x: number, y: number, maxWidth: number): EmbossedLogo | null {
	if (!scene.textures.exists("title-logo")) return null;

	const probe = scene.add.image(0, 0, "title-logo").setVisible(false);
	const logoScale = probe.width > maxWidth ? maxWidth / probe.width : 1;
	probe.destroy();

	const haloLayers: Phaser.GameObjects.Image[] = [];
	for (const [dx, dy] of [
		[-1, -1],
		[1, -1],
		[-1, 1],
		[1, 1],
	]) {
		haloLayers.push(scene.add.image(x + dx, y + dy, "title-logo").setScale(logoScale).setTint(PALETTE.espressoDark).setAlpha(0.4));
	}
	const shadow = scene.add.image(x + 3, y + 4, "title-logo").setScale(logoScale).setTint(PALETTE.espressoDark).setAlpha(0.45);
	const highlight = scene.add.image(x - 1, y - 2, "title-logo").setScale(logoScale).setTint(PALETTE.creamLight).setAlpha(0.3);
	const logo = scene.add.image(x, y, "title-logo").setScale(logoScale);

	return { logo, shadow, highlight, haloLayers };
}
