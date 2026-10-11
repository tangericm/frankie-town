
// You can write more code here

/* START OF COMPILED CODE */

import Phaser from "phaser";
import { attachGameplay } from "../systems/attachGameplay";
import { FRANKIE_ORIGIN } from "../data/frankieAnim";
import { fitCameraToRoom, roomZoom } from "../systems/cameraFit";
import { readMoveVector, pickFacing, Facing } from "../systems/playerMovement";
/* START-USER-IMPORTS */
/* END-USER-IMPORTS */

const MOVE_SPEED = 110;
const MOVE_ACCEL = 900;
const MOVE_DRAG = 900;

export default class Bakery extends Phaser.Scene {

	constructor() {
		super("Bakery");

		/* START-USER-CTR-CODE */
		/* END-USER-CTR-CODE */
	}

	editorCreate(): void {

		this.add.image(0, 0, "bkry-pl-base").setOrigin(0, 0).setAlpha(0.6).setDepth(-3000);
		this.add.image(0, 0, "bkry-pl-ao").setOrigin(0, 0).setDepth(-1999);
		this.add.image(0, 0, "bkry-pl-void").setOrigin(0, 0).setDepth(-1998);

		this.add.tileSprite(80, 16, 352, 96, "bkry-pl-wallface").setOrigin(0, 0).setDepth(112);
		this.add.tileSprite(64, 112, 16, 224, "bkry-pl-side-w").setOrigin(0, 0).setDepth(-1500);
		this.add.tileSprite(432, 112, 16, 224, "bkry-pl-side-e").setOrigin(0, 0).setDepth(-1500);

		this.add.image(64, 59, "bkry-ca5e133e").setOrigin(0, 0).setDepth(156);
		this.add.image(239, 60, "bkry-e0d103f7").setOrigin(0, 0).setDepth(157);
		this.add.image(340, 104, "bkry-e9a74400").setOrigin(0, 0).setDepth(201);
		this.add.image(339, 19, "bkry-5f1255f1").setOrigin(0, 0).setDepth(116);
		this.add.image(122, 60, "bkry-3a8a34e1").setOrigin(0, 0).setDepth(157);
		this.add.image(269, 138, "bkry-a22c88ba").setOrigin(0, 0).setDepth(197.8);
		this.add.image(200, 100, "bkry-7296de2c").setOrigin(0, 0).setDepth(148);
		this.add.image(230, 344, "bkry-f18803a0").setOrigin(0, 0).setDepth(392);
		this.add.image(300, 151, "bkry-177ae803").setOrigin(0, 0).setDepth(195.6);
		this.add.image(83, 280, "bkry-3feb192d").setOrigin(0, 0).setDepth(328);
		this.add.image(263, 151, "bkry-6c0bf470").setOrigin(0, 0).setDepth(196.2);
		this.add.image(78, 151, "bkry-44995877").setOrigin(0, 0).setDepth(195.0);
		this.add.image(86, 130, "bkry-362fc164").setOrigin(0, 0).setDepth(197.2);
		this.add.image(85, 174, "bkry-239e9866").setOrigin(0, 0).setDepth(222);
		this.add.image(234, 127, "bkry-51ddb961").setOrigin(0, 0).setDepth(197.5);
		this.add.image(262, 104, "bkry-9dce45df").setOrigin(0, 0).setDepth(152);
		this.add.image(320, 338, "bkry-eea2be3c").setOrigin(0, 0).setDepth(386);
		this.add.image(126, 338, "bkry-3c6ccea4").setOrigin(0, 0).setDepth(386);
		this.add.image(384, 280, "bkry-cd7a4658").setOrigin(0, 0).setDepth(328);
		this.add.image(226, 151, "bkry-adf57c69").setOrigin(0, 0).setDepth(195.9);
		this.add.image(152, 151, "bkry-1e531afe").setOrigin(0, 0).setDepth(195.3);
		this.add.image(189, 151, "bkry-93ea2809").setOrigin(0, 0).setDepth(196.5);
		this.add.image(115, 151, "bkry-c4546d9d").setOrigin(0, 0).setDepth(196.8);
		this.add.image(365, 200, "bkry-d8543cff").setOrigin(0, 0).setDepth(248);
		this.add.image(365, 238, "bkry-94dbd9ae").setOrigin(0, 0).setDepth(286);
		this.add.image(135, 200, "bkry-ccb1c08e").setOrigin(0, 0).setDepth(248);
		this.add.image(135, 238, "bkry-c050a0c1").setOrigin(0, 0).setDepth(286);

		const baker = this.add.sprite(321, 196, "teddy-idle-baker-south-sheet", 0).setOrigin(0.5, 1).setDepth(194);
		this.baker = baker;
		const frankie = this.add.sprite(294, 271, "frankie-idle-south-sheet", 0).setOrigin(...FRANKIE_ORIGIN["idle-south"]);
		this.frankie = frankie;

		this.events.emit("scene-awake");
	}

	private frankie!: Phaser.GameObjects.Sprite;
	private baker!: Phaser.GameObjects.Sprite;
	private frankieShadow!: Phaser.GameObjects.Ellipse;
	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
	private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
	private facing: Facing = "south";

	static COLLIDERS: number[][] = [[0, 0, 608, 16], [0, 16, 608, 16], [0, 32, 608, 16], [0, 48, 608, 16], [0, 64, 608, 16], [0, 80, 608, 16], [0, 96, 608, 16], [0, 112, 80, 16], [432, 112, 176, 16], [0, 128, 80, 16], [432, 128, 176, 16], [0, 144, 80, 16], [432, 144, 176, 16], [0, 160, 80, 16], [432, 160, 176, 16], [0, 176, 80, 16], [432, 176, 176, 16], [0, 192, 80, 16], [432, 192, 176, 16], [0, 208, 80, 16], [432, 208, 176, 16], [0, 224, 80, 16], [432, 224, 176, 16], [0, 240, 80, 16], [432, 240, 176, 16], [0, 256, 80, 16], [432, 256, 176, 16], [0, 272, 80, 16], [432, 272, 176, 16], [0, 288, 80, 16], [432, 288, 176, 16], [0, 304, 80, 16], [432, 304, 176, 16], [0, 320, 80, 16], [432, 320, 176, 16], [0, 336, 608, 16], [0, 352, 608, 16], [0, 368, 608, 16], [0, 384, 608, 16], [0, 400, 608, 16], [0, 416, 608, 16], [0, 432, 608, 16], [0, 448, 608, 16], [0, 464, 608, 16], [0, 480, 608, 16], [0, 496, 608, 16], [0, 512, 608, 16], [0, 528, 608, 16], [0, 544, 608, 16], [81, 104, 62, 43], [256, 105, 62, 43], [357, 149, 62, 43], [356, 62, 62, 43], [139, 105, 62, 43], [278, 151, 31, 21], [208, 124, 31, 21], [239, 371, 31, 21], [308, 171, 31, 21], [91, 306, 31, 21], [272, 171, 31, 21], [87, 171, 31, 21], [95, 151, 31, 21], [94, 196, 31, 21], [242, 151, 31, 21], [270, 112, 31, 21], [328, 363, 31, 21], [135, 363, 31, 21], [392, 306, 31, 21], [234, 171, 31, 21], [160, 171, 31, 21], [198, 171, 31, 21], [124, 171, 31, 21], [374, 220, 31, 21], [374, 258, 31, 21], [144, 220, 31, 21], [144, 258, 31, 21], [301, 180, 40, 14]];

	/* START-USER-CODE */

	create() {
		this.editorCreate();

		const map = this.make.tilemap({ key: "bkry-pl-map" });
		const tiles = map.addTilesetImage("tiles", "bkry-pl-tiles")!;
		map.createLayer("floor", tiles, 0, 0)!.setDepth(-2000);

		this.makeAnim("teddy-idle-baker", "teddy-idle-baker-south-sheet");
		if (this.baker) this.baker.play("teddy-idle-baker");

		this.addObjectShadows();
		this.depthSort();
		this.setupPlayer();
		this.buildColliders();

		const cam = this.cameras.main;
		cam.startFollow(this.frankie, true);
		cam.roundPixels = true;
		cam.setSize(this.scale.width, this.scale.height);
		// Zoom is chosen per viewport, not fixed: at the desktop zoom a phone saw a 244px-wide slice
		// of this 608px-wide room, which is the case roomZoom exists to avoid. Street and Market got
		// this treatment first; the two interiors need it just as much.
		const applyCameraFit = () => {
			const zoom = roomZoom(cam);
			cam.setZoom(zoom);
			fitCameraToRoom(cam, 608, 560, zoom);
		};
		applyCameraFit();
		const onCamResize = (gameSize: Phaser.Structs.Size) => {
			cam.setSize(gameSize.width, gameSize.height);
			applyCameraFit();
		};
		this.scale.on(Phaser.Scale.Events.RESIZE, onCamResize);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, onCamResize));

		attachGameplay(this, "Bakery");
	}

	/** A soft contact shadow under each furniture object, read from its current bounds. */
	private addObjectShadows() {
		const skip = new Set(["bkry-pl-base", "bkry-pl-ao", "bkry-pl-void", "bkry-pl-wallface", "bkry-pl-side-w", "bkry-pl-side-e"]);
		for (const obj of [...this.children.list]) {
			if (!(obj instanceof Phaser.GameObjects.Image || obj instanceof Phaser.GameObjects.Sprite)) continue;
			const key = (obj as Phaser.GameObjects.Image).texture?.key;
			if (!key || skip.has(key) || obj === this.frankie) continue;
			const b = (obj as Phaser.GameObjects.Image).getBounds();
			this.add.ellipse(b.centerX, b.bottom - 3, b.width * 0.7, Math.max(6, b.height * 0.16), 0x1a1410, 0.22)
				.setDepth(b.bottom - 1)
				.setVisible(false); // shadows off for now
		}
	}

	/** Foot-line depth, re-applied after editorCreate so it survives Phaser Editor stripping depth. */
	private depthSort() {
		for (const obj of this.children.list) {
			if (obj === this.frankie) continue;
			// The baker's depth must stay in the narrow band under the counter run (see
			// DRAW_ORDER_DEPTH above) regardless of his own y -- without this skip, depthSort's
			// generic bottom-of-sprite rule recomputes his depth from y every time his position
			// is nudged (found the hard way: a 2px display-only nudge silently bumped his
			// *depth* too, from 194 back up into the counter band, undoing the counter-vs-baker
			// fix even though nothing about the fix itself had changed).
			if (obj === this.baker) continue;
			if (obj instanceof Phaser.Tilemaps.TilemapLayer) continue;
			if (obj instanceof Phaser.GameObjects.Rectangle || obj instanceof Phaser.GameObjects.Ellipse) continue;
			const go = obj as unknown as { setDepth?: (d: number) => void; getBounds?: () => Phaser.Geom.Rectangle; texture?: { key?: string } };
			if (typeof go.setDepth !== "function" || typeof go.getBounds !== "function") continue;
			if (go.texture?.key === "bkry-pl-base") { go.setDepth!(-3000); continue; }
			if (go.texture?.key === "bkry-pl-ao") { go.setDepth!(-1999); continue; }
			if (go.texture?.key === "bkry-pl-void") { go.setDepth!(-1998); continue; }
			if (go.texture?.key === "bkry-pl-side-w" || go.texture?.key === "bkry-pl-side-e") { go.setDepth!(-1500); continue; }
			// These use engine-map.json's own authoritative drawOrder (see DRAW_ORDER_DEPTH) --
			// the counter tiles all share a y (tying/misordering them under the generic
			// bottom-of-sprite rule) and the on-counter decorations need to draw after their
			// counter regardless of their own sprite bottom. Keep what editorCreate gave them.
			if (["bkry-44995877", "bkry-1e531afe", "bkry-177ae803", "bkry-adf57c69", "bkry-6c0bf470", "bkry-93ea2809", "bkry-c4546d9d", "bkry-a22c88ba", "bkry-51ddb961", "bkry-362fc164"].includes(go.texture?.key ?? "")) continue;
			go.setDepth!(Math.round(go.getBounds!().bottom));
		}
	}

	private setupPlayer() {
		const f = this.frankie;
		for (const dir of ["south", "north", "east", "west"]) {
			this.makeAnim("frankie-idle-" + dir, "frankie-idle-" + dir + "-sheet");
			this.makeAnim("frankie-walking-" + dir, "frankie-walking-" + dir + "-sheet");
		}
		this.physics.add.existing(f);
		this.physics.world.setBounds(0, 0, 608, 560);
		const fBody = f.body as Phaser.Physics.Arcade.Body;
		fBody.setCollideWorldBounds(true);
		fBody.setMaxSpeed(MOVE_SPEED);
		fBody.setDrag(MOVE_DRAG, MOVE_DRAG);
		f.play("frankie-idle-south");
		this.syncBody(true);
		this.frankieShadow = this.add.ellipse(f.x, f.y - 1, f.displayWidth * 0.5, f.displayWidth * 0.18, 0x1a1410, 0.28)
			.setVisible(false); // shadows off for now
		const kb = this.input.keyboard!;
		this.cursors = kb.createCursorKeys();
		this.wasd = kb.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;
	}

	private makeAnim(key: string, sheet: string) {
		if (!this.anims.exists(key)) {
			this.anims.create({ key, frames: this.anims.generateFrameNumbers(sheet, {}), frameRate: 9, repeat: -1 });
		}
	}

	private syncBody(resize = false) {
		const f = this.frankie;
		const body = f.body as Phaser.Physics.Arcade.Body;
		if (resize) body.setSize(28, 14, false);
		body.setOffset(f.displayOriginX - 14, f.displayOriginY - 14);
	}

	/** Positions Frankie facing a specific direction, replaying the matching idle so a scene
	 * arrival can face him away from the door he just walked through instead of always south. */
	faceAndSpawn(x: number, y: number, facing: "north" | "south" | "east" | "west") {
		const f = this.frankie;
		f.setPosition(x, y);
		this.facing = facing;
		f.play("frankie-idle-" + facing, true);
		f.setOrigin(...FRANKIE_ORIGIN["idle-" + facing]);
		this.syncBody(false);
	}

	private buildColliders() {
		const group = this.physics.add.staticGroup();
		for (const b of Bakery.COLLIDERS) {
			const r = this.add.rectangle(b[0] + b[2] / 2, b[1] + b[3] / 2, b[2], b[3]);
			r.setVisible(false);
			this.physics.add.existing(r, true);
			group.add(r);
		}
		this.physics.add.collider(this.frankie, group);
	}

	update() {
		const f = this.frankie;
		if (!f || !this.cursors) return;
		// While physics is paused (a cutscene) this loop would still stomp whatever animation the
		// cutscene set on him back to idle/walking every frame, since it runs unconditionally off
		// keyboard state. Skip it entirely during a cutscene. (See build-apartment-pixellab.py.)
		if (this.physics.world.isPaused) return;
		const body = f.body as Phaser.Physics.Arcade.Body;
		const move = readMoveVector(this, this.cursors, this.wasd);
		if (move.x !== 0 || move.y !== 0) {
			body.setAcceleration(move.x * MOVE_ACCEL, move.y * MOVE_ACCEL);
			this.facing = pickFacing(move, this.facing);
			f.play("frankie-walking-" + this.facing, true);
			f.setOrigin(...FRANKIE_ORIGIN["walking-" + this.facing]);
		} else {
			body.setAcceleration(0, 0);
			f.play("frankie-idle-" + this.facing, true);
			f.setOrigin(...FRANKIE_ORIGIN["idle-" + this.facing]);
		}
		this.syncBody(false);
		f.setDepth(f.y);
		this.frankieShadow.setPosition(f.x, f.y - 1).setDepth(f.y - 1);
	}

	/* END-USER-CODE */
}

/* END OF COMPILED CODE */
