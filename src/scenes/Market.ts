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

export default class Market extends Phaser.Scene {

	constructor() {
		super("Market");

		/* START-USER-CTR-CODE */
		/* END-USER-CTR-CODE */
	}

	editorCreate(): void {

		this.add.image(196, 853, "mkt-5fe27a60").setOrigin(0, 0).setDepth(1061);
		this.add.image(9, 847, "mkt-3aad62f6").setOrigin(0, 0).setDepth(1061);
		this.add.image(416, 846, "mkt-d1188798").setOrigin(0, 0).setDepth(1061);
		this.add.image(20, 543, "mkt-50bba3ae").setOrigin(0, 0).setDepth(663);
		this.add.image(15, 555, "mkt-2cdf5def").setOrigin(0, 0).setDepth(596);
		this.add.image(55, 555, "mkt-d503e915").setOrigin(0, 0).setDepth(603);
		this.add.image(95, 555, "mkt-aa19ded6").setOrigin(0, 0).setDepth(603);
		this.add.image(135, 555, "mkt-3991c8b4").setOrigin(0, 0).setDepth(603);
		this.add.image(179, 561, "mkt-02a22919").setOrigin(0, 0).setDepth(603);
		this.add.image(219, 561, "mkt-d92bec47").setOrigin(0, 0).setDepth(603);
		this.add.image(259, 561, "mkt-99e7525f").setOrigin(0, 0).setDepth(603);
		this.add.image(190, 742, "mkt-e6d882e9").setOrigin(0, 0).setDepth(784);
		this.add.image(230, 742, "mkt-feaf8f05").setOrigin(0, 0).setDepth(784);
		this.add.image(270, 742, "mkt-f3f231d8").setOrigin(0, 0).setDepth(784);
		this.add.image(284, 561, "mkt-e8ec8969").setOrigin(0, 0).setDepth(604);
		this.add.image(284, 591, "mkt-2d8aa89e").setOrigin(0, 0).setDepth(634);
		this.add.image(284, 621, "mkt-961b0b0e").setOrigin(0, 0).setDepth(664);
		this.add.image(284, 651, "mkt-bf935391").setOrigin(0, 0).setDepth(694);
		this.add.image(284, 681, "mkt-d9119726").setOrigin(0, 0).setDepth(724);
		this.add.image(284, 711, "mkt-15d1112f").setOrigin(0, 0).setDepth(754);
		this.add.image(284, 741, "mkt-cf05cc18").setOrigin(0, 0).setDepth(784);
		this.add.image(4, 562, "mkt-e5ec4541").setOrigin(0, 0).setDepth(605);
		this.add.image(98, 741, "mkt-4ff26e2a").setOrigin(0, 0).setDepth(784);
		this.add.image(4, 592, "mkt-80c0fd16").setOrigin(0, 0).setDepth(635);
		this.add.image(4, 622, "mkt-09034518").setOrigin(0, 0).setDepth(665);
		this.add.image(4, 652, "mkt-546362ba").setOrigin(0, 0).setDepth(695);
		this.add.image(4, 682, "mkt-1bf45b2b").setOrigin(0, 0).setDepth(725);
		this.add.image(4, 712, "mkt-c12f8fc1").setOrigin(0, 0).setDepth(755);
		this.add.image(4, 742, "mkt-cd53438a").setOrigin(0, 0).setDepth(785);
		this.add.image(58, 741, "mkt-87ad9f92").setOrigin(0, 0).setDepth(784);
		this.add.image(18, 741, "mkt-9379b909").setOrigin(0, 0).setDepth(784);
		this.add.image(406, 645, "mkt-de3248d3").setOrigin(0, 0).setDepth(783);
		this.add.image(255, 605, "mkt-a9670bde").setOrigin(0, 0).setDepth(632);
		this.add.image(345, 264, "mkt-7e8391bf").setOrigin(0, 0).setDepth(295);
		this.add.image(345, 425, "mkt-ceed94f9").setOrigin(0, 0).setDepth(456);
		this.add.image(344, 74, "mkt-085ffe82").setOrigin(0, 0).setDepth(105);
		this.add.image(25, 771, "mkt-ce533fdf").setOrigin(0, 0).setDepth(813);
		this.add.image(7, 55, "mkt-d7f8b2d1").setOrigin(0, 0).setDepth(580);
		this.add.image(460, 38, "mkt-e94844d4").setOrigin(0, 0).setDepth(558);
		this.add.image(543, 654, "mkt-d73b9247").setOrigin(0, 0).setDepth(783);
		this.add.image(412, 551, "mkt-7a2ebce1").setOrigin(0, 0).setDepth(646);
		this.add.image(268, 372, "mkt-c3e2b055").setOrigin(0, 0).setDepth(401);
		this.add.image(341, 327, "mkt-cfb0fa85").setOrigin(0, 0).setDepth(356);
		this.add.image(415, 370, "mkt-2ea31bc4").setOrigin(0, 0).setDepth(399);
		this.add.image(148, 264, "mkt-8afaf6af").setOrigin(0, 0).setDepth(353);
		this.add.image(532, 622, "mkt-043f32cf").setOrigin(0, 0).setDepth(642);
		this.add.image(572, 614, "mkt-267373dd").setOrigin(0, 0).setDepth(640);
		this.add.image(535, 564, "mkt-e3437e55").setOrigin(0, 0).setDepth(609);
		this.add.image(589, 574, "mkt-80d857f9").setOrigin(0, 0).setDepth(605);

		const frankie = this.add.sprite(320, 1100, "frankie-idle-south-sheet", 0).setOrigin(...FRANKIE_ORIGIN["idle-south"]);
		this.frankie = frankie;

		this.events.emit("scene-awake");
	}

	private frankie!: Phaser.GameObjects.Sprite;
	private frankieShadow!: Phaser.GameObjects.Ellipse;
	private worldColliders!: Phaser.Physics.Arcade.StaticGroup;
	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
	private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
	private facing: Facing = "south";

	static COLLIDERS: number[][] = [[0, 0, 640, 48], [0, 48, 304, 80], [416, 48, 224, 80], [624, 128, 16, 976], [112, 240, 208, 80], [400, 240, 192, 80], [112, 400, 208, 80], [400, 400, 192, 80], [0, 1104, 640, 128], [236, 969, 141, 92], [42, 608, 79, 55], [275, 388, 28, 13], [348, 343, 28, 13], [422, 386, 28, 13], [171, 314, 82, 39], [9, 967, 187, 94], [416, 966, 213, 95], [32, 575, 31, 21], [63, 582, 250, 22], [194, 763, 119, 21], [303, 613, 10, 141], [23, 584, 10, 201], [32, 763, 112, 21], [411, 722, 131, 61], [260, 614, 35, 18], [25, 795, 112, 18], [7, 412, 168, 168], [461, 392, 171, 166], [544, 742, 86, 41], [412, 604, 110, 42], [532, 630, 26, 12], [573, 628, 39, 12], [539, 588, 40, 21], [594, 591, 22, 14]];
	static SUGAR_OBJECT_KEYS = {
		lane1: "mkt-ceed94f9",
		lane2: "mkt-7e8391bf",
		lane3: "mkt-085ffe82",
	} as const;

	/* START-USER-CODE */

	getFrankie(): Phaser.GameObjects.Sprite { return this.frankie; }

	getWorldColliders(): Phaser.Physics.Arcade.StaticGroup { return this.worldColliders; }

	getAuthoredImage(textureKey: string): Phaser.GameObjects.Image | null {
		const found = this.children.list.find(
			(child): child is Phaser.GameObjects.Image =>
				child instanceof Phaser.GameObjects.Image && child.texture.key === textureKey
		);
		return found ?? null;
	}

	create() {
		this.editorCreate();

		const map = this.make.tilemap({ key: "mkt-pl-map" });
		const tiles = map.addTilesetImage("tiles", "mkt-pl-tiles")!;
		map.createLayer("floor", tiles, 0, 0)!.setDepth(-2000);

		this.depthSort();
		this.setupPlayer();
		this.buildColliders();

		const cam = this.cameras.main;
		cam.startFollow(this.frankie, true);
		cam.roundPixels = true;
		cam.setSize(this.scale.width, this.scale.height);
		// Zoom is chosen per viewport, not fixed: this room is far taller than a phone screen, and at
		// the desktop zoom a phone saw a 244px-wide slice of a 640px-wide square. See roomZoom.
		const applyCameraFit = () => {
			const zoom = roomZoom(cam);
			cam.setZoom(zoom);
			fitCameraToRoom(cam, 640, 1104, zoom);
		};
		applyCameraFit();
		const onCamResize = (gameSize: Phaser.Structs.Size) => {
			cam.setSize(gameSize.width, gameSize.height);
			applyCameraFit();
		};
		this.scale.on(Phaser.Scale.Events.RESIZE, onCamResize);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, onCamResize));

		attachGameplay(this, "Market");
	}

	/** Foot-line depth, re-applied after editorCreate so authored objects and actors interleave. */
	private depthSort() {
		for (const obj of this.children.list) {
			if (obj === this.frankie) continue;
			if (obj instanceof Phaser.Tilemaps.TilemapLayer) continue;
			if (obj instanceof Phaser.GameObjects.Rectangle || obj instanceof Phaser.GameObjects.Ellipse) continue;
			const go = obj as unknown as { setDepth?: (d: number) => void; getBounds?: () => Phaser.Geom.Rectangle };
			if (typeof go.setDepth !== "function" || typeof go.getBounds !== "function") continue;
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
		this.physics.world.setBounds(0, 0, 640, 1232);
		const fBody = f.body as Phaser.Physics.Arcade.Body;
		fBody.setCollideWorldBounds(true);
		fBody.setMaxSpeed(MOVE_SPEED);
		fBody.setDrag(MOVE_DRAG, MOVE_DRAG);
		f.play("frankie-idle-south");
		this.syncBody(true);
		this.frankieShadow = this.add.ellipse(f.x, f.y - 1, f.displayWidth * 0.5, f.displayWidth * 0.18, 0x1a1410, 0.28)
			.setVisible(false);
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

	/** Positions Frankie and keeps facing, animation, origin, and body offset in sync. */
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
		for (const bounds of Market.COLLIDERS) {
			const rectangle = this.add.rectangle(
				bounds[0] + bounds[2] / 2,
				bounds[1] + bounds[3] / 2,
				bounds[2],
				bounds[3]
			);
			rectangle.setVisible(false);
			this.physics.add.existing(rectangle, true);
			group.add(rectangle);
		}
		this.worldColliders = group;
		this.physics.add.collider(this.frankie, group);
	}

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
