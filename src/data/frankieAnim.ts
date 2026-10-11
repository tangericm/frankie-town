/**
 * Frankie's idle and walking sheets were exported to different canvas sizes (idle: 64x64,
 * walking: 84x84/88x88, to give the walk cycle's limbs room to swing) with the character NOT
 * padded identically within each canvas. A single shared setOrigin(x, 1) -- as Phaser Editor
 * generates by default -- anchors to each canvas's bottom edge, which sits 13-14px below
 * Frankie's actual feet in the walking sheets but not the idle ones. That mismatch is why he
 * visibly hops up when he starts walking and drops back down when he stops.
 *
 * Values below are each sheet's own feet position (bottom of the opaque pixels in frame_000)
 * expressed as an origin fraction, measured directly from the source PNGs -- see the "measure
 * feet position" step in the conversation that added this file if these ever need recomputing
 * after new art.
 */
export const FRANKIE_ORIGIN: Record<string, [number, number]> = {
	"idle-south": [0.5078, 1.0],
	"idle-north": [0.4766, 0.9688],
	"idle-east": [0.4609, 0.9375],
	"idle-west": [0.5234, 0.9375],
	"walking-south": [0.4943, 0.8523],
	"walking-north": [0.4943, 0.8409],
	"walking-east": [0.4762, 0.8333],
	"walking-west": [0.5119, 0.8333],
	// Resized sheets (2026-09-15, scripts/pixellab/resize-frankie-sleeping.py): 30x48 frames, the
	// curled dog drawn x3-30 / y1-43, the wake-up's final standing frame with feet on the last row.
	"sleeping-south": [0.55, 0.8958],
	"wake-up-south": [0.55, 1.0],
};
