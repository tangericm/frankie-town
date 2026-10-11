import Phaser from "phaser";
import { getAudio } from "../audio";
import { burst, buzz, flashWhite, reducedMotion } from "../juice";
import { LANE_CHECKPOINTS, LANE_RESET_TIMING } from "../../data/market.gameplay";

export type HazardLaneId = "lane1" | "lane3";

/**
 * What happens when a lane hazard catches Frankie.
 *
 * This used to be a bare 180ms fade to black and back. Nothing marked the moment of impact, so
 * failing a lane looked identical to the screen glitching -- players read it as the game blinking at
 * them rather than as "the cart hit you". The recovery fade is still the same fade; everything
 * before it is the part that says a hit happened.
 *
 * `onRecovered` fires once Frankie is standing on the checkpoint again with control back, which is
 * where Pierre's setback line for the lane belongs -- during the hit he is a distraction, and
 * mid-fade the dialogue box would open over a black screen.
 */
export function createLaneReset(
	scene: Phaser.Scene,
	frankie: Phaser.GameObjects.Sprite,
	faceAndSpawn: (x: number, y: number, facing: "north" | "south" | "east" | "west") => void,
	onRecovered: (lane: HazardLaneId) => void = () => {},
	ignoreInUi: (o: Phaser.GameObjects.GameObject) => void = () => {},
) {
	let resetting = false;
	return (lane: HazardLaneId) => {
		if (resetting || scene.physics.world.isPaused) return;
		resetting = true;
		const checkpoint = LANE_CHECKPOINTS[lane];
		const body = frankie.body as Phaser.Physics.Arcade.Body;
		// Stopped and inert for the whole hit -- being knocked out of your own control is half of
		// what makes it read as a hit rather than as a teleport.
		body.stop();
		body.enable = false;
		const camera = scene.cameras.main;
		const { r, g, b } = LANE_RESET_TIMING.flashColor;
		getAudio(scene).sfx(lane === "lane3" ? "cart-hit" : "setback");
		// The moment of contact, on Frankie himself: two frames of white, a haptic thump, and
		// what hit him scattering off him (grey feathers for the pigeons, dust for the cart).
		if (!reducedMotion(scene)) flashWhite(scene, frankie);
		buzz(20);
		burst(scene, frankie.x, frankie.y - 14, lane === "lane3" ? 0xc9a074 : 0x9aa3ad, ignoreInUi, {
			shape: lane === "lane3" ? "puff" : "feather",
			count: lane === "lane3" ? 8 : 10,
			speed: { min: 50, max: 130 },
			depth: frankie.y + 1,
		});
		if (!reducedMotion(scene)) {
			camera.shake(LANE_RESET_TIMING.shakeMs, LANE_RESET_TIMING.shakeIntensity);
			camera.flash(LANE_RESET_TIMING.flashMs, r, g, b);
		}
		scene.time.delayedCall(LANE_RESET_TIMING.holdMs, () => {
			camera.fadeOut(LANE_RESET_TIMING.fadeOutMs, 0, 0, 0);
			camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
				faceAndSpawn(checkpoint.x, checkpoint.y, "north");
				body.reset(checkpoint.x, checkpoint.y);
				body.enable = true;
				camera.fadeIn(LANE_RESET_TIMING.fadeInMs, 0, 0, 0);
				camera.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
					resetting = false;
					onRecovered(lane);
				});
			});
		});
	};
}
