import Phaser from "phaser";

/**
 * Ambient background wildlife for Street -- purely decorative (no interact zone, no
 * collider, no dialogue). Both sheets are PixelLab's uniform-grid spritesheet export (fixed
 * cell_size, unlike Frankie/Rafa/Teddy's own per-direction sheets which vary in size between
 * directions -- see pack-sheets.mjs's own comment on that), so frames are addressed by plain
 * row*columns+col arithmetic instead of pack-sheets.mjs's per-direction measurement pass.
 *
 * Row layout (measured from each export's own .json, not guessed):
 *   pigeon-idle-sheet / pigeon-walking-sheet: 9 columns. Row 0 = 8 rotation stills (unused here).
 *     Rows 1-4 = a 9-frame animation for south/east/north/west respectively.
 *   stork-idle-sheet: 8 columns. Row 0 = 8 rotation stills (unused here). Row 1 = a 4-frame idle
 *     animation, exported for a single direction only (north) -- the stork never moves or turns.
 */
const PIGEON_COLUMNS = 9;
const PIGEON_ROW = { south: 1, east: 2, north: 3, west: 4 } as const;
type CardinalDir = keyof typeof PIGEON_ROW;

function pigeonFrames(row: number) {
	const start = row * PIGEON_COLUMNS;
	return { start, end: start + 8 };
}

export function makePigeonAnims(scene: Phaser.Scene) {
	for (const dir of Object.keys(PIGEON_ROW) as CardinalDir[]) {
		const row = PIGEON_ROW[dir];
		if (!scene.anims.exists(`pigeon-walking-${dir}`)) {
			scene.anims.create({ key: `pigeon-walking-${dir}`, frames: scene.anims.generateFrameNumbers("pigeon-walking-sheet", pigeonFrames(row)), frameRate: 10, repeat: -1 });
		}
		if (!scene.anims.exists(`pigeon-idle-${dir}`)) {
			scene.anims.create({ key: `pigeon-idle-${dir}`, frames: scene.anims.generateFrameNumbers("pigeon-idle-sheet", pigeonFrames(row)), frameRate: 6, repeat: -1 });
		}
	}
}

/** A stork standing at a single fixed spot (the pond's edge), playing its one exported idle loop
 * forever. No movement, no facing changes -- only one direction was ever exported for it. */
export function createStork(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Sprite {
	if (!scene.anims.exists("stork-idle")) {
		scene.anims.create({ key: "stork-idle", frames: scene.anims.generateFrameNumbers("stork-idle-sheet", { start: 8, end: 11 }), frameRate: 4, repeat: -1 });
	}
	const stork = scene.add.sprite(x, y, "stork-idle-sheet", 8).setOrigin(0.5, 1).setDepth(y);
	stork.play("stork-idle");
	return stork;
}

/** A pigeon that wanders a slow random walk within `bounds`, pausing to idle between legs.
 * `start` is its spawn foot-position and initial facing; it defaults to the centre of `bounds`
 * facing south, which is only sensible for a single bird -- two pigeons sharing one box must be
 * given distinct starts or they overlap into what looks like one bird until the first leg runs.
 * Returns the sprite; call the returned `stop()` to cancel its wander loop (scene shutdown). */
export function createPigeon(
	scene: Phaser.Scene,
	bounds: { x: number; y: number; width: number; height: number },
	start?: { x: number; y: number; facing: CardinalDir }
): { sprite: Phaser.GameObjects.Sprite; stop: () => void } {
	makePigeonAnims(scene);
	const startX = start ? start.x : bounds.x + bounds.width / 2;
	const startY = start ? start.y : bounds.y + bounds.height / 2;
	const startFacing: CardinalDir = start ? start.facing : "south";
	const pigeon = scene.add.sprite(startX, startY, "pigeon-idle-sheet", 0).setOrigin(0.5, 1).setDepth(startY);
	pigeon.play(`pigeon-idle-${startFacing}`);

	let stopped = false;
	let activeTween: Phaser.Tweens.Tween | null = null;
	let pendingTimer: Phaser.Time.TimerEvent | null = null;

	const pickPoint = () => ({
		x: bounds.x + Math.random() * bounds.width,
		y: bounds.y + Math.random() * bounds.height,
	});

	const walkLeg = () => {
		if (stopped) return;
		const target = pickPoint();
		const dx = target.x - pigeon.x;
		const dy = target.y - pigeon.y;
		const dist = Math.hypot(dx, dy);
		// A short/zero-length leg would still be worth an idle beat, but not worth a tween.
		if (dist < 8) {
			pendingTimer = scene.time.delayedCall(400, walkLeg);
			return;
		}
		const dir: CardinalDir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "west" : "east") : (dy < 0 ? "north" : "south");
		pigeon.play(`pigeon-walking-${dir}`, true);
		activeTween = scene.tweens.add({
			targets: pigeon,
			x: target.x,
			y: target.y,
			duration: (dist / 22) * 1000, // ~22px/s -- slower than Frankie's own walk, reads as a pigeon not a dog
			ease: "Linear",
			onUpdate: () => pigeon.setDepth(pigeon.y),
			onComplete: () => {
				if (stopped) return;
				pigeon.play(`pigeon-idle-${dir}`, true);
				pendingTimer = scene.time.delayedCall(800 + Math.random() * 1600, walkLeg);
			},
		});
	};
	pendingTimer = scene.time.delayedCall(600 + Math.random() * 1200, walkLeg);

	const stop = () => {
		stopped = true;
		activeTween?.stop();
		pendingTimer?.remove();
	};
	return { sprite: pigeon, stop };
}
