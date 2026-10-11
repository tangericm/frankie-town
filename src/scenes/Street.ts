
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

export default class Street extends Phaser.Scene {

	constructor() {
		super("Street");

		/* START-USER-CTR-CODE */
		/* END-USER-CTR-CODE */
	}

	editorCreate(): void {

		this.add.image(0, 0, "str-pl-base").setOrigin(0, 0).setDepth(-3000);

		this.add.image(586, 279, "str-a26eee4e").setOrigin(0, 0).setDepth(333);
		this.add.image(671, 674, "str-8417388e").setOrigin(0, 0).setDepth(699);
		this.add.image(1001, 621, "str-b60b996c").setOrigin(0, 0).setDepth(636);
		this.add.image(975, 449, "str-48f8ff56").setOrigin(0, 0).setDepth(474);
		this.add.image(642, 674, "str-1fc47a2b").setOrigin(0, 0).setDepth(699);
		this.add.image(308, 18, "str-d2aa0b43").setOrigin(0, 0).setDepth(232);
		this.add.image(715, 17, "str-61a217fe").setOrigin(0, 0).setDepth(232);
		this.add.image(495, 24, "str-a603d760").setOrigin(0, 0).setDepth(232);
		this.add.image(872, 260, "str-3e2b86eb").setOrigin(0, 0).setDepth(475);
		this.add.image(241, 293, "str-bfb932f7").setOrigin(0, 0).setDepth(523);
		this.add.image(553, 541, "str-0609215a").setOrigin(0, 0).setDepth(690);
		this.add.image(951, 443, "str-48061059").setOrigin(0, 0).setDepth(474);
		this.add.image(521, 342, "str-23b94559").setOrigin(0, 0).setDepth(364);
		this.add.image(607, 446, "str-b1ed7030").setOrigin(0, 0).setDepth(469);
		this.add.image(674, 311, "str-7847b6b0").setOrigin(0, 0).setDepth(357);
		this.add.image(405, 650, "str-d81e5fe5").setOrigin(0, 0).setDepth(692);
		this.add.image(352, 624, "str-cbd68e60").setOrigin(0, 0).setDepth(666);
		this.add.image(350, 651, "str-830764ad").setOrigin(0, 0).setDepth(693);
		this.add.image(407, 624, "str-838b5e6c").setOrigin(0, 0).setDepth(666);
		this.add.image(280, 579, "str-a777aaa0").setOrigin(0, 0).setDepth(625);
		this.add.image(1006, 165, "str-b6408967").setOrigin(0, 0).setDepth(211);
		this.add.image(710, 598, "str-8f4622fb").setOrigin(0, 0).setDepth(691);
		this.add.image(448, 473, "str-656aa083").setOrigin(0, 0).setDepth(518);
		this.add.image(642, 438, "str-cfe42365").setOrigin(0, 0).setDepth(460);
		this.add.image(570, 420, "str-56fc6ce8").setOrigin(0, 0).setDepth(441);
		this.add.image(568, 371, "str-4e6e73e9").setOrigin(0, 0).setDepth(391);
		this.add.image(668, 391, "str-8c0fcdb5").setOrigin(0, 0).setDepth(414);
		this.add.image(648, 364, "str-06fad888").setOrigin(0, 0).setDepth(387);
		this.add.image(641, 408, "str-b388e943").setOrigin(0, 0).setDepth(428);
		this.add.image(541, 386, "str-59a83357").setOrigin(0, 0).setDepth(409);
		this.add.image(541, 396, "str-f77c9a8c").setOrigin(0, 0).setDepth(419);
		this.add.image(523, 464, "str-30588d5e").setOrigin(0, 0).setDepth(486);
		this.add.image(696, 465, "str-9a5160dc").setOrigin(0, 0).setDepth(480);
		this.add.image(687, 471, "str-82474bdc").setOrigin(0, 0).setDepth(486);
		this.add.image(696, 475, "str-bdadbfc4").setOrigin(0, 0).setDepth(490);
		this.add.image(668, 400, "str-d0a1bbbe").setOrigin(0, 0).setDepth(423);
		this.add.image(668, 408, "str-02b2c3f7").setOrigin(0, 0).setDepth(431);
		this.add.image(523, 428, "str-bb276ca4").setOrigin(0, 0).setDepth(451);
		this.add.image(714, 233, "str-d59d5f63").setOrigin(0, 0).setDepth(326);
		this.add.image(234, 581, "str-fac29529").setOrigin(0, 0).setDepth(627);
		this.add.image(865, 545, "str-2010d6e9").setOrigin(0, 0).setDepth(590);
		this.add.image(935, 554, "str-cc5533e3").setOrigin(0, 0).setDepth(597);
		this.add.image(984, 554, "str-ca465b87").setOrigin(0, 0).setDepth(597);
		this.add.image(931, 179, "str-d71a811f").setOrigin(0, 0).setDepth(210);
		this.add.image(967, 175, "str-8fdfca2c").setOrigin(0, 0).setDepth(208);
		this.add.image(474, 321, "str-d352fa9d").setOrigin(0, 0).setDepth(336);
		this.add.image(1050, 169, "str-a35fe2d2").setOrigin(0, 0).setDepth(212);
		this.add.image(327, 595, "str-cfd5b33b").setOrigin(0, 0).setDepth(626);
		this.add.image(857, 669, "str-e4beaae7").setOrigin(0, 0).setDepth(696);
		this.add.image(932, 611, "str-8228a6c6").setOrigin(0, 0).setDepth(642);

		const frankie = this.add.sprite(608, 560, "frankie-idle-south-sheet", 0).setOrigin(...FRANKIE_ORIGIN["idle-south"]);
		this.frankie = frankie;

		this.events.emit("scene-awake");
	}

	private frankie!: Phaser.GameObjects.Sprite;
	private frankieShadow!: Phaser.GameObjects.Ellipse;
	private worldColliders!: Phaser.Physics.Arcade.StaticGroup;
	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
	private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
	private facing: Facing = "south";

	static COLLIDERS: number[][] = [[0, 0, 1232, 176], [0, 176, 112, 656], [1104, 176, 128, 656], [512, 336, 208, 160], [848, 544, 192, 160], [0, 832, 1232, 160], [534, 140, 141, 92], [587, 305, 62, 28], [644, 685, 57, 14], [1002, 624, 14, 12], [958, 460, 47, 14], [308, 138, 187, 94], [715, 137, 213, 95], [874, 260, 199, 215], [243, 293, 231, 230], [554, 541, 152, 149], [523, 352, 20, 12], [609, 457, 20, 12], [689, 345, 19, 12], [417, 671, 25, 21], [356, 645, 40, 21], [362, 672, 25, 21], [411, 645, 40, 21], [285, 604, 38, 21], [1015, 190, 74, 22], [752, 681, 15, 10], [452, 497, 40, 21], [644, 448, 20, 12], [572, 429, 20, 12], [572, 379, 16, 12], [671, 402, 18, 29], [650, 375, 20, 12], [643, 416, 20, 12], [543, 397, 20, 22], [526, 474, 19, 12], [697, 468, 14, 22], [688, 474, 14, 12], [671, 411, 18, 12], [526, 439, 17, 12], [756, 316, 15, 10], [238, 606, 40, 21], [867, 569, 45, 21], [943, 576, 32, 21], [992, 576, 32, 21], [936, 196, 22, 14], [974, 190, 28, 18], [475, 324, 15, 12], [330, 612, 26, 14], [858, 682, 30, 14], [935, 628, 26, 14]];

	/* START-USER-CODE */

	create() {
		this.editorCreate();

		const map = this.make.tilemap({ key: "str-pl-map" });
		const tiles = map.addTilesetImage("tiles", "str-pl-tiles")!;
		map.createLayer("floor", tiles, 0, 0)!.setDepth(-2000);

		this.depthSort();
		this.setupPlayer();
		this.buildColliders();

		const cam = this.cameras.main;
		cam.startFollow(this.frankie, true);
		cam.roundPixels = true;
		cam.setSize(this.scale.width, this.scale.height);
		// Zoom is chosen per viewport, not fixed: this is the largest room in the game, and at the
		// desktop zoom a phone saw a 244px-wide slice of it. See roomZoom.
		const applyCameraFit = () => {
			const zoom = roomZoom(cam);
			cam.setZoom(zoom);
			fitCameraToRoom(cam, 1232, 840, zoom);
		};
		applyCameraFit();
		const onCamResize = (gameSize: Phaser.Structs.Size) => {
			cam.setSize(gameSize.width, gameSize.height);
			applyCameraFit();
		};
		this.scale.on(Phaser.Scale.Events.RESIZE, onCamResize);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, onCamResize));

		attachGameplay(this, "Street");
	}

	/** Foot-line depth, re-applied after editorCreate so it survives Phaser Editor stripping depth. */
	private depthSort() {
		for (const obj of this.children.list) {
			if (obj === this.frankie) continue;
			if (obj instanceof Phaser.Tilemaps.TilemapLayer) continue;
			if (obj instanceof Phaser.GameObjects.Rectangle || obj instanceof Phaser.GameObjects.Ellipse) continue;
			const go = obj as unknown as { setDepth?: (d: number) => void; getBounds?: () => Phaser.Geom.Rectangle; texture?: { key?: string } };
			if (typeof go.setDepth !== "function" || typeof go.getBounds !== "function") continue;
			if (go.texture?.key === "str-pl-base") { go.setDepth!(-3000); continue; }
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
		// Full canvas height here, not ROOM_H -- this is only the outer arcade-physics clamp, and the
		// south wall collider (COLLIDERS, derived from the same not-floor pixels) already stops
		// Frankie well north of the painted edge, so the extra slack below it is never reached.
		this.physics.world.setBounds(0, 0, 1232, 992);
		const fBody = f.body as Phaser.Physics.Arcade.Body;
		fBody.setCollideWorldBounds(true);
		fBody.setMaxSpeed(MOVE_SPEED);
		fBody.setDrag(MOVE_DRAG, MOVE_DRAG);
		f.play("frankie-idle-south");
		this.syncBody(true);
		this.frankieShadow = this.add.ellipse(f.x, f.y - 1, f.displayWidth * 0.5, f.displayWidth * 0.18, 0x1a1410, 0.28)
			.setVisible(false); // matches the other two scenes -- shadows off for now
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
		for (const b of Street.COLLIDERS) {
			const r = this.add.rectangle(b[0] + b[2] / 2, b[1] + b[3] / 2, b[2], b[3]);
			r.setVisible(false);
			this.physics.add.existing(r, true);
			group.add(r);
		}
		this.worldColliders = group;
		this.physics.add.collider(this.frankie, group);
	}

	/** attachGameplay swaps the market arch's generated passage blocker for its two real pillars
	 * through this. It previously existed only as a hand edit inside the generated file, which a
	 * rebuild silently deleted -- taking Street's arch collision with it. */
	getWorldColliders(): Phaser.Physics.Arcade.StaticGroup { return this.worldColliders; }

	update() {
		const f = this.frankie;
		if (!f || !this.cursors) return;
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
