import Phaser from "phaser";
import { PALETTE } from "./palette";
import { reducedMotion } from "./juice";
import { segmentClear, type Rect } from "./pathfinding";
import { getTextScale } from "./textScale";

export interface InteractionZone {
	id: string;
	x: number;
	y: number;
	radius: number;
	/** Authored ground footprint. Approach points x/y still guide desktop walking. */
	reachBounds?: Rect;
	/** How far above (x, y) the badge floats -- characters are anchored at their feet, so a
	 * taller sprite (Teddy's hat) needs more clearance than a small item lying on a table. */
	indicatorOffset?: number;
	/** Authored painted bounds for sprites with transparent canvas padding. */
	marker?: { x: number; y: number; top: number };
	/** Speech for characters; paw for objects, with a verb distinguishing use from pickup. */
	kind?: "npc" | "item" | "object";
	action?: string | (() => string);
	/** Present for touch: this object gets a pointerdown handler gated by range. */
	gameObject?: Phaser.GameObjects.GameObject;
	visualObject?: Phaser.GameObjects.GameObject;
	/** Minimum screen-space touch size for small pickups; never changes art or collision. */
	minTapSize?: number;
	/** Tie-break between overlapping zones: the highest priority in range wins, distance only
	 * decides among equals. Default 0. Flavour (prop thoughts) registers at -1 so it can never
	 * shadow a quest item, a gate or an NPC that shares its patch of floor. */
	priority?: number;
	onInteract: () => void;
}

/** Extra reach, in px, when the player is facing the zone. A zone's radius is measured from
 * Frankie's foot point; approaching a prop side-on, his 28px body and the prop's own collider keep
 * that point 8-12px further away than a head-on approach does, which is exactly the "it works from
 * the front but not from the side" complaint. Facing it is the tell that he means it. */
export const FACING_REACH_BONUS = 12;
const FACING_VECTORS: Record<string, { x: number; y: number }> = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 } };

/** Pure distance logic: which zone (if any) is nearest and within its own radius, after
 * priority -- a lower-priority zone is only ever picked when nothing higher is in range. With a
 * `facing`, a zone the player is turned towards counts as FACING_REACH_BONUS px closer. */
export function nearestInRange<T extends { id: string; x: number; y: number; radius: number; priority?: number; reachBounds?: Rect }>(
	zones: T[],
	px: number,
	py: number,
	facing?: string,
	barriers: Rect[] = [],
): string | null {
	const f = facing ? FACING_VECTORS[facing] : undefined;
	let best: { id: string; dist: number; priority: number } | null = null;
	for (const zone of zones) {
		const r = zone.reachBounds;
		const point = r ? { x: Math.max(r.x, Math.min(px, r.x + r.width)), y: Math.max(r.y, Math.min(py, r.y + r.height)) } : zone;
		const dx = point.x - px;
		const dy = point.y - py;
		const dist = Math.hypot(dx, dy);
		const facingIt = f && dist > 0 && (dx * f.x + dy * f.y) / dist > 0.5;
		if (dist > zone.radius + (facingIt ? FACING_REACH_BONUS : 0)) continue;
		// The subject/support may occupy the endpoint (e.g. a bike on the blocked lawn).
		// Other obstacles, such as the bedroom partition, still break reach.
		if (r && !segmentClear({ x: px, y: py }, point, barriers.filter(b => !(point.x > b.x && point.x < b.x + b.width && point.y > b.y && point.y < b.y + b.height)))) continue;
		const priority = zone.priority ?? 0;
		if (!best || priority > best.priority || (priority === best.priority && dist < best.dist)) best = { id: zone.id, dist, priority };
	}
	return best?.id ?? null;
}

/**
 * Where each badge's "pointing" tip sits relative to its own container origin, measured off the
 * icon PNGs' alpha channels.
 *
 * icon-interact is a speech bubble whose tail hangs off the BOTTOM-LEFT (tip at local (11, 26) of a
 * 32px icon, i.e. 5px left and 10px below centre). Centring that container on an NPC therefore puts
 * the tail -- the part a player reads as "I mean this one" -- five pixels to his left, which is
 * exactly the reported "not really centered well... offset into the left". icon-pickup's paw has no
 * tail and is horizontally centred, but its lowest pixels sit at the same +10, so correcting both
 * makes indicatorOffset mean one consistent thing: how far above the zone point the tip floats.
 */
export const BADGE_TIP = {
	"icon-interact": { x: -5, y: 10 },
	"icon-pickup": { x: 0, y: 10 },
} as const;

/** Where to place an "icon-interact" badge so its tail tip lands `indicatorOffset` above (x, y) --
 * the same anchoring InteractionManager's own badge uses, exported so a scene drawing its own
 * always-on badge lands in exactly the same spot instead of a few px off it. */
export function badgeAnchor(x: number, y: number, indicatorOffset: number) {
	return { x: x - BADGE_TIP["icon-interact"].x, y: y - indicatorOffset - BADGE_TIP["icon-interact"].y };
}

export class InteractionManager {
	private getPlayerPosition: () => { x: number; y: number };
	private zones: InteractionZone[] = [];
	/** Per-zone touch wiring, kept so removeZone can undo exactly what addZone did. */
	private touchHandlers = new Map<string, { gameObject: Phaser.GameObjects.GameObject; handler: (pointer: Phaser.Input.Pointer) => void }>();
	private consumedPointers = new Map<number, number>();
	private interactKey: Phaser.Input.Keyboard.Key;
	private isTouch: boolean;
	private npcIndicator: Phaser.GameObjects.Container;
	private itemIndicator: Phaser.GameObjects.Container;
	private npcTip = BADGE_TIP["icon-interact"];
	private itemTip = BADGE_TIP["icon-pickup"];
	private bounce = { offset: 0 };
	private highlighted: Phaser.GameObjects.Sprite | null = null;
	private originalTint: number[] = [];

	private scene: Phaser.Scene;

	private getPlayerFacing: () => string | undefined;

	constructor(scene: Phaser.Scene, getPlayerPosition: () => { x: number; y: number }, getPlayerFacing: () => string | undefined = () => undefined) {
		this.scene = scene;
		this.getPlayerPosition = getPlayerPosition;
		this.getPlayerFacing = getPlayerFacing;
		this.isTouch = Boolean(scene.sys.game.device.input.touch);
		this.interactKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);

		// Speech + Talk for people; paw + a short action verb for objects and pickups.
		this.npcIndicator = this.makeBadge(scene, "icon-interact", "!");
		this.itemIndicator = this.makeBadge(scene, "icon-pickup", "+");
		scene.tweens.add({
			targets: this.bounce,
			offset: -4,
			duration: 450,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
		});
		scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.tweens.killTweensOf(this.bounce));
	}

	private makeBadge(scene: Phaser.Scene, textureKey: string, fallbackGlyph: string): Phaser.GameObjects.Container {
		const badgeParts = scene.textures.exists(textureKey)
			? [scene.add.image(0, 0, textureKey)]
			: [
					scene.add.circle(0, 0, 8, PALETTE.panelLight, 0.95).setStrokeStyle(1.5, PALETTE.border),
					scene.add.text(0, 0, fallbackGlyph, { fontFamily: "\"Pixelify Sans\", monospace", fontSize: "13px", color: PALETTE.css.accentDark, fontStyle: "bold" }).setOrigin(0.5, 0.55),
				];
		const verb = scene.add.text(0, -20, "", { fontFamily: "Nunito, sans-serif", fontSize: "12px", fontStyle: "bold", color: PALETTE.css.panelLight, stroke: PALETTE.css.espressoDark, strokeThickness: 3 }).setOrigin(0.5, 1);
		return scene.add.container(0, 0, [...badgeParts, verb]).setDepth(9000).setVisible(false);
	}

	private nearest(zones: InteractionZone[], x: number, y: number, facing?: string) {
		const bodies = [...(this.scene.physics.world.staticBodies ?? [])] as Phaser.Physics.Arcade.StaticBody[];
		return nearestInRange(zones, x, y, facing, bodies.filter(b => b.enable));
	}

	/** The zone whose radius contains a world point (a tap on the floor beside a thing), or null.
	 * Highest priority wins, then nearest -- same rule as selection. */
	zoneContaining(x: number, y: number): InteractionZone | null {
		const id = this.nearest(this.zones, x, y);
		return id ? this.zones.find((z) => z.id === id) ?? null : null;
	}

	/** The zone the player would trigger right now, or null. */
	nearestId(): string | null {
		const player = this.getPlayerPosition();
		return this.nearest(this.zones, player.x, player.y, this.getPlayerFacing());
	}

	/** The whole press/release belongs to the UI that accepted its press, even after it closes. */
	consumePointer(pointer: Phaser.Input.Pointer) {
		this.consumedPointers.set(pointer.id, pointer.downTime);
	}

	canInteractPointer(pointer: Phaser.Input.Pointer): boolean {
		return !this.scene.physics.world.isPaused && !this.scene.data?.get("hud:modal")
			&& !(this.consumedPointers.has(pointer.id) && this.consumedPointers.get(pointer.id) === pointer.downTime);
	}
	private syncTapTarget(zone: InteractionZone) {
		if (!zone.minTapSize || !zone.gameObject?.scene) return;
		const image = zone.gameObject as Phaser.GameObjects.Sprite;
		const area = image.input?.hitArea as Phaser.Geom.Rectangle | undefined;
		if (!area) return;
		const zoom = this.scene.cameras.main.zoom;
		const scale = this.scene.scale.displayScale;
		const width = Math.max(image.width, zone.minTapSize * scale.x / (Math.abs(image.scaleX) * zoom));
		const height = Math.max(image.height, zone.minTapSize * scale.y / (Math.abs(image.scaleY) * zoom));
		area.setTo((image.width - width) / 2, (image.height - height) / 2, width, height);
	}

	addZone(zone: InteractionZone) {
		this.zones.push(zone);
		// `.scene` is undefined on a destroyed GameObject, and setInteractive() dereferences it
		// (this.scene.sys.input) -- so without this guard a zone registered against a sprite from
		// an already-shut-down scene throws instead of just being inert. Tap targets are wired on
		// every device now: on desktop a click on Teddy walks over and talks (TapMove), same as a tap.
		if (zone.gameObject?.scene && "setInteractive" in zone.gameObject) {
			const image = zone.gameObject as Phaser.GameObjects.Sprite;
			if (zone.minTapSize) image.setInteractive(new Phaser.Geom.Rectangle(), Phaser.Geom.Rectangle.Contains);
			else image.setInteractive();
			this.syncTapTarget(zone);
			const handler = (pointer: Phaser.Input.Pointer) => {
				if (!this.canInteractPointer(pointer)) return;
				if (this.isTouch && (pointer.getDuration() > 350 || Math.hypot(pointer.x - pointer.downX, pointer.y - pointer.downY) >= 8)) return;
				const player = this.getPlayerPosition();
				const objects = this.scene.input.hitTestPointer(pointer);
				// Phaser's input is topOnly: only the topmost interactive object under a touch gets
				// pointerdown. When a bigger tap target is drawn over a smaller one (the bakery's
				// bread-basket art over the 40px hidden-item rectangle inside it), the small one
				// never hears the tap even though it is the zone Frankie can use. So a tap that
				// reached *this* object hands over to the usable zone if its target is also under
				// the finger.
				const usableId = this.nearest(this.zones.filter(z => z.gameObject && objects.includes(z.gameObject)), player.x, player.y, this.getPlayerFacing());
				const usable = this.zones.find(z => z.id === usableId);
				if (usable) { usable.onInteract(); return; }
				// Out of reach: hand the zone to TapMove, which walks him there and interacts.
				this.scene.events.emit("zone:tap", zone);
			};
			this.touchHandlers.set(zone.id, { gameObject: zone.gameObject, handler });
			zone.gameObject.on(this.isTouch ? "pointerup" : "pointerdown", handler);
		}
	}

	removeZone(id: string) {
		this.zones = this.zones.filter((z) => z.id !== id);
		// Hand the hit area back too. A zone's sprite stays in the scene after its zone is gone --
		// the market gate is still standing once it has been opened -- and an input-enabled sprite
		// keeps consuming touches for as long as it exists, whether or not anything still listens.
		// TouchControls declines to start the joystick on a touch an interactable owns, so a 128px
		// dead hit area left over the hen yard meant the stick silently refused to appear over a
		// large part of the one area the game asks you to chase things around in.
		// Disable immediately: removeInteractive queues deletion, which can erase the new hit
		// area when Michell is re-registered at the table during the same frame.
		const registered = this.touchHandlers.get(id);
		if (!registered) return;
		this.touchHandlers.delete(id);
		registered.gameObject.off(this.isTouch ? "pointerup" : "pointerdown", registered.handler);
		if (registered.gameObject.scene) (registered.gameObject as unknown as Phaser.GameObjects.Sprite).disableInteractive();
	}

	/**
	 * Does one of these objects (Phaser's own hit-test list for a touch) belong to a zone that is
	 * actually usable right now?
	 *
	 * TouchControls asks before starting the joystick. "Is anything interactive under the thumb"
	 * was the old question, and it is the wrong one: an interactable out of Frankie's reach runs a
	 * pointerdown handler that correctly does nothing, and the touch is swallowed anyway -- so
	 * pressing a distant NPC, or a sprite whose zone is long gone, read as the controls dying.
	 * Only a usable painted target under the finger gets to keep the touch.
	 */
	ownsTouch(objects: Phaser.GameObjects.GameObject[]): boolean {
		if (objects.length === 0) return false;
		const player = this.getPlayerPosition();
		return Boolean(this.nearest(this.zones.filter(z => z.gameObject && objects.includes(z.gameObject)), player.x, player.y, this.getPlayerFacing()));
	}

	/** Dev/test inspection only -- not used by gameplay code. */
	debugState() {
		const player = this.getPlayerPosition();
		return { player, facing: this.getPlayerFacing(), isTouch: this.isTouch, zones: this.zones.map((z) => ({ id: z.id, x: z.x, y: z.y, radius: z.radius, reachBounds: z.reachBounds })), nearestId: this.nearestId() };
	}

	/** Opt-in replay tools bypass distance, but still respect every dialogue/cutscene lock. */
	interactForPlaytest(id: string) {
		if (this.scene.physics.world.isPaused) return;
		this.zones.find(zone => zone.id === id)?.onInteract();
	}

	private highlightObject(target: Phaser.GameObjects.Sprite | null) {
		if (target === this.highlighted) return;
		if (this.highlighted?.scene) this.highlighted.setTint(...this.originalTint);
		this.highlighted = target && typeof target.setTint === "function" ? target : null;
		if (this.highlighted) {
			const t = this.highlighted;
			this.originalTint = [t.tintTopLeft, t.tintTopRight, t.tintBottomLeft, t.tintBottomRight];
			t.setTint(0xffdda0);
		}
	}

	/** Hides both badges without touching zone state; the next update() re-places them. */
	hideIndicators() {
		this.npcIndicator.setVisible(false);
		this.itemIndicator.setVisible(false);
		this.highlightObject(null);
	}

	/** Call every frame from the scene's update(). */
	update() {
		for (const zone of this.zones) this.syncTapTarget(zone);
		if (this.scene.physics.world.isPaused) {
			Phaser.Input.Keyboard.JustDown(this.interactKey);
			this.hideIndicators();
			return;
		}
		const nearestId = this.nearestId();
		const nearest = this.zones.find((z) => z.id === nearestId) ?? null;
		const active = nearest?.kind === "item" || nearest?.kind === "object" ? this.itemIndicator : this.npcIndicator;
		const inactive = active === this.itemIndicator ? this.npcIndicator : this.itemIndicator;

		inactive.setVisible(false);
		active.setVisible(Boolean(nearest));
		this.highlightObject((nearest?.visualObject ?? nearest?.gameObject) as Phaser.GameObjects.Sprite ?? null);
		if (nearest) {
			const verb = active.list[active.list.length - 1] as Phaser.GameObjects.Text;
			const fontSize = Math.ceil(12 * getTextScale(this.scene.game) * Math.max(1, this.scene.scale.displayScale.y / this.scene.cameras.main.zoom));
			if (verb.style.fontSize !== `${fontSize}px`) verb.setFontSize(fontSize);
			verb.setText(typeof nearest.action === "function" ? nearest.action() : nearest.action ?? (nearest.kind === "item" ? "Take" : nearest.kind === "object" ? "Look" : "Talk"));
			const target = (nearest.visualObject ?? nearest.gameObject) as Phaser.GameObjects.Sprite | undefined;
			const bounds = target?.getBounds?.();
			const x = nearest.marker?.x ?? bounds?.centerX ?? nearest.x;
			// Offset by the badge's own tip so the tip -- not the container's centre -- lands
			// indicatorOffset above the zone point.
			const tip = active === this.itemIndicator ? this.itemTip : this.npcTip;
			active.setPosition(
				x - tip.x,
				(nearest.marker ? nearest.marker.top - 4 : bounds ? bounds.top - 4 : nearest.y - (nearest.indicatorOffset ?? 28)) - tip.y + (reducedMotion(this.scene) ? 0 : this.bounce.offset),
			);
		}
		if (nearest && Phaser.Input.Keyboard.JustDown(this.interactKey)) nearest.onInteract();
	}
}
