
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

export default class Apartment extends Phaser.Scene {

	constructor() {
		super("Apartment");

		/* START-USER-CTR-CODE */
		/* END-USER-CTR-CODE */
	}

	editorCreate(): void {

		this.add.image(0, 0, "apt-pl-base").setOrigin(0, 0).setAlpha(0.6).setDepth(-3000);
		this.add.image(0, 0, "apt-pl-ao").setOrigin(0, 0).setDepth(-1999);
		this.add.image(0, 0, "apt-pl-void").setOrigin(0, 0).setDepth(-1998);

		this.add.image(0, 0, "apt-pl-architecture").setOrigin(0, 0).setDepth(-1400);
		this.add.image(368, 368, "apt-pl-architecture-laundry-front").setOrigin(0, 0).setDepth(432);

		const o_edb72036 = this.add.sprite(166, 96, "michell-working-north-sheet", 0).setOrigin(0, 0).setDepth(200);
		this.michell = o_edb72036;
		this.add.image(306, 57, "o_586251ba").setOrigin(0, 0).setDepth(145);
		this.add.image(202, 57, "o_983d7641").setOrigin(0, 0).setDepth(145);
		this.add.image(320, 129, "o_3331841b").setOrigin(0, 0).setDepth(179);
		this.add.image(275, 153, "o_90437f2e").setOrigin(0, 0).setDepth(177);
		this.add.image(376, 182, "o_57c870f8").setOrigin(0, 0).setDepth(182);
		this.add.image(364, 220, "o_50e6d2e6").setOrigin(0, 0).setDepth(220);
		this.add.image(193, 204, "o_76baba91").setOrigin(0, 0).setDepth(276);
		this.add.image(196, 265, "o_ccc5aab9").setOrigin(0, 0).setDepth(328);
		this.add.image(378, 182, "o_45343729").setOrigin(0, 0).setDepth(239);
		this.add.image(361, 221, "o_c16efb33").setOrigin(0, 0).setDepth(221);
		this.add.image(366, 250, "o_4f01924f").setOrigin(0, 0).setDepth(250);
		this.add.image(408, 410, "o_6ca3ff5f").setOrigin(0, 0).setDepth(493);
		this.add.image(358, 328, "o_8c94ef42").setOrigin(0, 0).setDepth(328);
		this.add.image(87, 380, "o_55fc82f4").setOrigin(0, 0).setDepth(440);
		this.add.image(81, 269, "o_c24ac8e5").setOrigin(0, 0).setDepth(352);
		this.add.image(70, 482, "o_f4b3a30f").setOrigin(0, 0).setDepth(531);
		this.add.image(104, 440, "o_bab867fe").setOrigin(0, 0).setDepth(532);
		this.add.image(260, 577, "o_7092a132").setOrigin(0, 0).setDepth(648);
		this.add.image(95, 534, "o_87b54ae0").setOrigin(0, 0).setDepth(622);

		const frankie = this.add.sprite(312, 368, "frankie-idle-south-sheet", 0).setOrigin(...FRANKIE_ORIGIN["idle-south"]);
		this.frankie = frankie;

		this.events.emit("scene-awake");
	}

	private frankie!: Phaser.GameObjects.Sprite;
	private worldColliders!: Phaser.Physics.Arcade.StaticGroup;
	private michell!: Phaser.GameObjects.Sprite;
	private frankieShadow!: Phaser.GameObjects.Ellipse;
	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
	private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
	private facing: Facing = "south";

	static COLLIDERS: number[][] = [[0, 0, 608, 144], [0, 144, 192, 176], [400, 144, 208, 272], [0, 320, 64, 128], [192, 368, 16, 80], [368, 384, 16, 16], [368, 416, 240, 16], [448, 432, 160, 80], [0, 448, 208, 64], [368, 480, 16, 32], [0, 512, 80, 80], [192, 512, 16, 16], [368, 512, 240, 64], [192, 576, 416, 48], [0, 592, 112, 32], [0, 624, 608, 80], [201, 168, 59, 32], [306, 123, 80, 22], [202, 123, 80, 22], [276, 166, 122, 13], [200, 258, 83, 70], [379, 191, 19, 8], [409, 472, 37, 21], [87, 425, 100, 15], [90, 328, 80, 24], [89, 517, 19, 14], [133, 504, 54, 28], [266, 629, 36, 19], [114, 594, 77, 28], [376, 185, 24, 53], [364, 220, 36, 46], [363, 224, 37, 55], [366, 250, 34, 114], [358, 328, 42, 83]];

	/* START-USER-CODE */

	create() {
		this.editorCreate();

		const map = this.make.tilemap({ key: "apt-pl-map" });
		const tiles = map.addTilesetImage("tiles", "apt-pl-tiles")!;
		map.createLayer("floor", tiles, 0, 0)!.setDepth(-2000);

		this.makeAnim("michell-working", "michell-working-north-sheet");
		if (this.michell) this.michell.play("michell-working");

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
			fitCameraToRoom(cam, 608, 704, zoom);
		};
		applyCameraFit();
		const onCamResize = (gameSize: Phaser.Structs.Size) => {
			cam.setSize(gameSize.width, gameSize.height);
			applyCameraFit();
		};
		this.scale.on(Phaser.Scale.Events.RESIZE, onCamResize);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, onCamResize));

		attachGameplay(this, "Apartment");
	}

	/** A soft contact shadow under each furniture object, read from its current bounds. */
	private addObjectShadows() {
		const skip = new Set(["apt-pl-base", "apt-pl-ao", "apt-pl-void"]);
		for (const obj of [...this.children.list]) {
			if (obj === this.frankie || obj === this.michell) {}
			if (!(obj instanceof Phaser.GameObjects.Image || obj instanceof Phaser.GameObjects.Sprite)) continue;
			const key = (obj as Phaser.GameObjects.Image).texture?.key;
			if (!key || skip.has(key) || key.startsWith("apt-pl-architecture") || obj === this.frankie) continue;
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
			if (obj instanceof Phaser.Tilemaps.TilemapLayer) continue;
			if (obj instanceof Phaser.GameObjects.Rectangle || obj instanceof Phaser.GameObjects.Ellipse) continue;
			const go = obj as unknown as { setDepth?: (d: number) => void; getBounds?: () => Phaser.Geom.Rectangle; texture?: { key?: string } };
			if (typeof go.setDepth !== "function" || typeof go.getBounds !== "function") continue;
			if (go.texture?.key === "apt-pl-base") { go.setDepth!(-3000); continue; }
			if (go.texture?.key === "apt-pl-ao") { go.setDepth!(-1999); continue; }
			if (go.texture?.key === "apt-pl-void") { go.setDepth!(-1998); continue; }
			if (go.texture?.key?.startsWith("apt-pl-architecture")) {
				go.setDepth!(go.texture.key === "apt-pl-architecture-laundry-front" ? 432 : -1400); continue;
			}
			// Michell is a 128x128 character frame with 24px of transparent padding under her
			// chair, so the generic bottom-of-sprite rule below reads her depth as 224 -- 24px
			// south of where her desk is actually painted (200). The desk's own collider stops
			// Frankie with his feet at y215, which is south of the painted desk and north of
			// 224, so he walked up to the desk and was drawn behind it. editorCreate already
			// gives her the depth measured off her opaque pixels (see opaque_bottom()); keep it.
			if (obj === this.michell) continue;
			// These decorations sit on top of taller furniture (a cabinet, a counter), and the
			// piece each one sits on has to keep its authored depth too -- not just the
			// decoration. Recomputing only the furniture from its frame bottom (242 for the
			// cabinet) while the decoration held its authored value (239, computed against that
			// cabinet's own opaque bottom of 238) put the cabinet back on top and hid the
			// sewing machine behind it. Both sides of the pair are authored, so both are kept.
			if (["o_45343729", "o_4f01924f", "o_50e6d2e6", "o_57c870f8", "o_87b54ae0", "o_8c94ef42", "o_bab867fe", "o_c16efb33", "o_f4b3a30f"].includes(go.texture?.key ?? "")) continue;
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
		this.physics.world.setBounds(0, 0, 608, 704);
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
		for (const b of Apartment.COLLIDERS) {
			const r = this.add.rectangle(b[0] + b[2] / 2, b[1] + b[3] / 2, b[2], b[3]);
			r.setVisible(false);
			this.physics.add.existing(r, true);
			group.add(r);
		}
		this.worldColliders = group;
		this.physics.add.collider(this.frankie, group);
	}

	/** attachGameplay adds Michell's desk blocker through this -- the generated per-object footprint
	 * is a shallow strip at each object's base, which is right for walking behind a bookcase and
	 * wrong for a desk somebody is sitting at. */
	getWorldColliders(): Phaser.Physics.Arcade.StaticGroup { return this.worldColliders; }

	update() {
		const f = this.frankie;
		if (!f || !this.cursors) return;
		// While physics is paused (a cutscene -- Rafa's walk-in, the opening dialogue, Frankie's
		// sleep/wake sequence) movement can't actually apply, but this loop would still stomp
		// whatever animation a cutscene set on him back to idle/walking every frame regardless,
		// since it runs unconditionally off keyboard state. Skip it entirely during a cutscene.
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
