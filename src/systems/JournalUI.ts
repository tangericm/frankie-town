import Phaser from "phaser";
import { GameState } from "./GameState";
import { PALETTE } from "./palette";
import { drawPanel, drawButton } from "./panel";
import { addPixelText } from "./pixelText";
import { QUEST } from "../data/quest";
import { HEN_IDS } from "../data/market.gameplay";
import { currentObjective, SceneKey } from "../data/objectives";
import { getAudio } from "./audio";
import { PROP_THOUGHTS } from "../data/propThoughts";
import { WINDOW_BOX } from "../data/street.gameplay";
import { TEXT_SCALE_CHANGED, getTextScale } from "./textScale";
import { MOTION, openPanel, closePanel, staggerDelay } from "./motion";
import { reducedMotion } from "./juice";
import { DINNER_CLUES } from "../data/dinner";

interface JournalRow {
	id: string;
	label: string;
	locked: boolean;
	/** Texture key for the small icon next to the checkbox -- omitted rows just show the
	 * checkbox/label, same as before icons existed for that ingredient. */
	icon?: string;
}

const ROWS: JournalRow[] = [
	{ id: "flour", label: "Flour", locked: false, icon: "icon-flour" },
	{ id: "eggs", label: "Eggs", locked: false, icon: "bkry-icon-eggs-basket" },
	{ id: "sugar", label: "Sugar", locked: false, icon: "bkry-icon-sugar-sack" },
	{ id: "butter", label: "Butter", locked: false, icon: "icon-butter" },
];

// Below this canvas width the journal is collapsed by default. Same threshold the camera uses to
// decide a viewport is a phone rather than a desktop window (see cameraFit's MIN_VISIBLE_WIDTH):
// on a 390px screen the expanded panel is 195x206 in the top-right corner, which is exactly where
// the market's third lane puts its sugar cube -- you could not see the thing you had walked all
// that way to pick up.
export const COLLAPSE_BELOW_WIDTH = 700;
// ...and below this height, whatever the width. A phone held in landscape is 844x390: wide enough
// to pass the width test, but its whole visible world is only ~528x244 game px, so the expanded
// panel covers proportionally more of the screen than it does in portrait, not less.
export const COLLAPSE_BELOW_HEIGHT = 500;

/** The same "is this a phone" test the default-collapsed decision uses (see the constructor),
 * shared with SettingsUI so its own modal sheet gets the same scrim treatment on the same class of
 * viewport. */
export function isPhoneViewport(scene: Phaser.Scene): boolean {
	return scene.scale.width < COLLAPSE_BELOW_WIDTH || scene.scale.height < COLLAPSE_BELOW_HEIGHT;
}
/** Where the collapsed state lives, so it survives the scene changes that rebuild this UI. */
const COLLAPSED_KEY = "frankie:journalCollapsed";
const UNREAD_KEY = "frankie:journalUnread";
// 44x44, not the old 44x34: the UI-UX audit's 44pt minimum tap target applies to this tab same as
// the settings gear.
const TAB_SIZE = { width: 44, height: 44 };
/** Consistent vertical padding around each measured text block below -- the panel is sized from
 * what its own text objects actually measure at (never a fixed guess), so a wrapped objective line,
 * the hen-progress row, or the text-size setting scaling every font up can never clip against the
 * panel's bottom edge (see the 2026-09-14 audit's journal-clipping item). */
const SECTION_PAD = 9;
/** Registry key the settings gear reads (see SettingsUI.ts) to keep itself below whatever this
 * panel's current bottom edge is -- collapsed (just the tab) or expanded (the full checklist),
 * so the two never overlap regardless of how tall the panel gets. */
export const JOURNAL_BOTTOM_KEY = "frankie:journalBottomY";

/** The walnut header strip's height -- title only, matching DialogueBox's name plate and
 * SettingsUI's walnut sheet (docs/research/2026-09-15-ui-revamp.md §3.4 item 2). */
const HEADER_HEIGHT = 30;
const ROW_ICON_SIZE = 26;
const SUB_ITEM_ICON_SIZE = 30;
// The checkbox is hand-drawn at a fixed 14x14 coordinate system (see drawCheckbox) -- scaling the
// Graphics object itself grows it in place rather than rewriting every drawn coordinate.
const CHECKBOX_SCALE = 1.3;
// Base (100%) font sizes for this panel's text objects -- the text-size setting multiplies these
// live in layout(), so a resize or a settings change re-measures rather than assuming the old size.
const OBJECTIVE_FONT = 15;
const ROW_FONT = 18;
const ERRAND_FONT = 15;
const HEN_FONT = 15;
const NOTEBOOK_FONT = 13;
const DINNER_FONT = 15;
const PILL_FONT = 14;

interface RowElements {
	box: Phaser.GameObjects.Graphics;
	icon: Phaser.GameObjects.Image | null;
	text: Phaser.GameObjects.Text;
}

export class JournalUI {
	private scene: Phaser.Scene;
	private scrollY = 0;
	private contentHeight = 0;
	private clip!: Phaser.GameObjects.Graphics;
	private panelHit!: Phaser.GameObjects.Rectangle;
	private dragY: number | null = null;
	private gameState: GameState;
	private container: Phaser.GameObjects.Container;
	private panel: Phaser.GameObjects.Graphics;
	private header: Phaser.GameObjects.Graphics;
	private headerTitle: Phaser.GameObjects.BitmapText;
	/** Dims the world behind the expanded panel on a phone (2026-09-15 UI revamp phase 4) --
	 * tapping it closes the panel, same as tapping the tab. Exposed via the `scrim` getter so
	 * attachGameplay's UI-camera snapshot can hide it from the world/zoomed camera too. */
	private scrimRect: Phaser.GameObjects.Rectangle;
	/** Row ids revealed as of the last time the panel was actually opened (a collapsed->expanded
	 * transition) -- compared each layout() against the currently revealed rows to light the tab's
	 * "new" pip. Session state only, per the task's own note (nothing persisted). */
	private lastOpenedRevealedIds = new Set<string>();
	private rowElements = new Map<string, RowElements>();
	private errandLabel: Phaser.GameObjects.Text;
	private subItemIcons = new Map<string, Phaser.GameObjects.Image>();
	private subItemCollectedLast = new Set<string>();
	/** Items already collected in the save whose icon is still flying in: drawn as uncollected
	 * until release, so the checklist lights up when the icon arrives, not when it left. */
	private heldSubItems = new Set<string>();
	/** Collapsed to a corner tab rather than the full checklist. Tapping either toggles it. */
	private collapsed = false;
	private tab: Phaser.GameObjects.Container | null = null;
	/** A second, independent errand row for the Market's hen-herding side quest -- kept separate
	 * from errandLabel/subItemIcons above (which are wired specifically to the bakery fetch items
	 * via QUEST.bakeryItemIds) rather than generalizing that mechanism for a second, unrelated
	 * errand with different start/complete conditions. */
	private henProgressLabel: Phaser.GameObjects.Text;
	private dinnerLabel: Phaser.GameObjects.Text;
	private cakeHistoryLabel: Phaser.GameObjects.Text;
	private notebookLabel!: Phaser.GameObjects.Text;
	/** The one-line current objective (src/data/objectives.ts). Two renderings of the same text:
	 * a row at the top of the expanded panel, and a pill beside the tab when the panel is collapsed
	 * -- the collapsed state is the default on every phone, and before this it left the screen with
	 * no memory of where Rafa had just said to go. */
	private objectiveText: Phaser.GameObjects.Text;
	private pill: Phaser.GameObjects.Container | null = null;
	private pillPlate!: Phaser.GameObjects.Graphics;
	private pillHit!: Phaser.GameObjects.Rectangle;
	private pillText!: Phaser.GameObjects.Text;
	private pillPointer!: Phaser.GameObjects.Graphics;
	private noticeVisible = false;
	private noticeAnnounced = false;
	private journalSignature = "";
	/** Which rows/sub-items were visible as of the last render() -- compared each pass to detect
	 * a hidden->shown transition, so the pop-in tween fires exactly once, not every render(). */
	private revealedRowsLast = new Set<string>();
	private errandWasActive = false;
	private signature() {
		return JSON.stringify([currentObjective(this.gameState, this.sceneKey)?.text, this.dinnerText(), this.notebookText(), this.visibleRows().map(row => [row.id, this.gameState.hasIngredient(row.id)]), QUEST.bakeryItemIds.map(id => this.gameState.hasBakeryItem(id)), this.gameState.marketHensHomedCount(), this.gameState.marketSugarCubeCount()]);
	}
	private onChangeListener = () => {
		const next = this.signature();
		if (next !== this.journalSignature && this.collapsed) { this.scene.game.registry.set(UNREAD_KEY, true); this.noticeAnnounced = false; }
		this.journalSignature = next;
		this.layout();
	};
	private showUpdateNotice = () => {
		const show = this.collapsed && this.container.visible && !this.scene.physics.world.isPaused && Boolean(this.scene.game.registry.get(UNREAD_KEY));
		if (show === this.noticeVisible) return;
		this.noticeVisible = show;
		this.layout();
		if (show && !this.noticeAnnounced) {
			this.noticeAnnounced = true;
			getAudio(this.scene).sfx("journal-tick", { volume: 0.5 });
			if (!reducedMotion(this.scene)) this.scene.tweens.add({ targets: this.tab, scale: 1.1, duration: 260, yoyo: true, repeat: 1, ease: "Sine.easeInOut" });
		}
	};

	constructor(scene: Phaser.Scene, gameState: GameState, private sceneKey: SceneKey) {
		this.scene = scene;
		this.gameState = gameState;
		if (scene.game.registry.get("frankie:journalNoticeState") !== gameState) {
			scene.game.registry.set(UNREAD_KEY, false);
			scene.game.registry.set("frankie:journalNoticeState", gameState);
		}
		this.clip = scene.add.graphics().setScrollFactor(0);
		scene.children.remove(this.clip);
		this.container = scene.add.container(0, 0).setScrollFactor(0, 0, true).setDepth(9500).setVisible(false);
		// Phaser 4's GeometryMask is Canvas-only; WebGL needs the native Mask filter.
		this.container.enableFilters();
		if (this.container.filters) this.container.filters.external.addMask(this.clip);
		else this.container.setMask(this.clip.createGeometryMask());
		this.panelHit = scene.add.rectangle(0, 0, 1, 1, 0, 0).setOrigin(0).setInteractive();
		this.container.add(this.panelHit);
		this.panelHit.on("pointerdown", (p: Phaser.Input.Pointer) => { this.dragY = p.y; });
		scene.input.on("pointermove", this.onDrag);
		scene.input.on("pointerup", this.endDrag);
		scene.input.keyboard?.on("keydown", this.onKey);
		scene.input.on("wheel", this.onWheel);
		scene.events.on("hud:panel", this.otherPanel);
		const remembered = scene.game.registry.get(COLLAPSED_KEY) as boolean | undefined;
		this.collapsed = remembered ?? (scene.scale.width < COLLAPSE_BELOW_WIDTH || scene.scale.height < COLLAPSE_BELOW_HEIGHT);
		// Sits just below the panel's own depth (9500) so it dims the world without covering the
		// panel, and below the tab/pill's depth (9501) so those stay tappable through it.
		// fillAlpha 1, not 0 -- that argument is the shape's OWN fill opacity (baked in once), separate
		// from the GameObject's `.alpha` this class fades via tween/setAlpha below; leaving it at 0
		// would multiply out to invisible no matter what `.alpha` is set to afterwards.
		this.scrimRect = scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, PALETTE.shadow, 1)
			.setOrigin(0)
			.setScrollFactor(0, 0)
			.setDepth(9499)
			.setVisible(false)
			.setAlpha(0)
			.setInteractive();
		this.scrimRect.on("pointerdown", () => this.setCollapsed(true));
		// Built here, not lazily in layout(): attachGameplay snapshots the UI camera's object list
		// exactly once, and anything created after that renders on BOTH cameras.
		this.buildTab().setVisible(false);
		this.buildPill().setVisible(false);
		this.panel = scene.add.graphics();
		this.container.add(this.panel);
		this.header = scene.add.graphics();
		this.container.add(this.header);
		// A real bitmap font, not Pixelify Sans through canvas Text -- same crisp-labels rule as
		// DialogueBox's name tag (docs/research/2026-09-15-ui-revamp.md §3.3).
		this.headerTitle = addPixelText(scene, 0, 0, "Journal [J]", { tint: PALETTE.panelLight }).setOrigin(0, 0.5);
		this.container.add(this.headerTitle);
		this.objectiveText = scene.add.text(0, 0, "", { padding: { x: 2, y: 3 }, resolution: 2, fontFamily: "Nunito, sans-serif", fontSize: "15px", fontStyle: "bold", color: PALETTE.css.text });
		this.container.add(this.objectiveText);
		for (const row of ROWS) {
			// A drawn checkbox/lock glyph instead of "[x]"/"[ ]"/"[locked]" bracket text -- reads
			// as a real UI control rather than a debug printout, matching the new panel frame.
			const box = scene.add.graphics();
			this.container.add(box);

			const hasIcon = Boolean(row.icon && scene.textures.exists(row.icon));
			const icon = hasIcon ? scene.add.image(0, 0, row.icon!).setDisplaySize(ROW_ICON_SIZE, ROW_ICON_SIZE) : null;
			if (icon) this.container.add(icon);

			// Nunito, not Pixelify Sans -- same legibility reasoning as DialogueBox's body text:
			// this is read as real words (ingredient names), not a short display label.
			const text = scene.add.text(0, 0, "", { padding: { x: 2, y: 3 }, resolution: 2, fontFamily: "Nunito, sans-serif", fontSize: "18px" });
			this.container.add(text);

			this.rowElements.set(row.id, { box, icon, text });
		}
		this.errandLabel = scene.add.text(0, 0, "Errand:", { padding: { x: 2, y: 3 }, resolution: 2, fontFamily: "Nunito, sans-serif", fontSize: "15px", color: PALETTE.css.textMuted });
		this.container.add(this.errandLabel);
		for (const id of QUEST.bakeryItemIds) {
			const key = `bkry-icon-${id}`;
			if (!scene.textures.exists(key)) continue;
			const icon = scene.add.image(0, 0, key).setDisplaySize(SUB_ITEM_ICON_SIZE, SUB_ITEM_ICON_SIZE);
			this.subItemIcons.set(id, icon);
			this.container.add(icon);
		}
		this.henProgressLabel = scene.add.text(0, 0, "", { padding: { x: 2, y: 3 }, resolution: 2, fontFamily: "Nunito, sans-serif", fontSize: "15px", color: PALETTE.css.textMuted });
		this.container.add(this.henProgressLabel);
		this.dinnerLabel = scene.add.text(0, 0, "", { padding: { x: 2, y: 3 }, resolution: 2, fontFamily: "Nunito, sans-serif", fontSize: "15px", color: PALETTE.css.text, lineSpacing: 3 });
		this.container.add(this.dinnerLabel);
		this.cakeHistoryLabel = scene.add.text(0, 0, "Birthday cake · baked", { padding: { x: 2, y: 3 }, resolution: 2, fontFamily: "Nunito, sans-serif", fontSize: "13px", color: PALETTE.css.textMuted });
		this.container.add(this.cakeHistoryLabel);
		// Frankie's notebook: the optional layer made visible (thoughts found per room, the window
		// box, events heard). Appears once any of it has happened, so the first-time journal is
		// still just the errand.
		this.notebookLabel = scene.add.text(0, 0, "", { padding: { x: 2, y: 3 }, resolution: 2, fontFamily: "Nunito, sans-serif", fontSize: "13px", color: PALETTE.css.textMuted, lineSpacing: 2 });
		this.container.add(this.notebookLabel);
		this.layout();
		// Instant sync (no animation) for whatever the initial state turns out to be -- only an
		// actual open/close from setCollapsed() should ever animate the scrim.
		this.setScrimVisible(!this.collapsed, false);
		scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
		// Settings > Text size (SettingsUI.ts) writes through the registry; re-layout live the same
		// way a resize does, rather than waiting for the next unrelated state change to catch up.
		scene.game.registry.events.on(TEXT_SCALE_CHANGED, this.layout, this);
		scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
			scene.input.keyboard?.off("keydown", this.onKey);
			scene.input.off("wheel", this.onWheel);
			scene.input.off("pointermove", this.onDrag);
			scene.input.off("pointerup", this.endDrag);
			scene.events.off("hud:panel", this.otherPanel);
			scene.game.registry.events.off(TEXT_SCALE_CHANGED, this.layout, this);
			this.gameState.offChange(this.onChangeListener);
			this.clip.destroy();
		});
		this.gameState.onChange(this.onChangeListener);
		this.journalSignature = this.signature();
		scene.events.on(Phaser.Scenes.Events.UPDATE, this.showUpdateNotice);
		scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.showUpdateNotice));
	}

	/** Rows the journal is allowed to show at all right now -- an ingredient not yet revealed
	 * (no chapter for it exists, or its chapter hasn't started) doesn't get a locked placeholder
	 * row, it just isn't in the list yet. */
	private visibleRows(): JournalRow[] {
		return ROWS.filter((row) => this.gameState.isIngredientRevealed(row.id));
	}

	/** The always-present corner tab. It is the expand affordance when collapsed, and stays visible
	 * when expanded so "tap here to get it out of the way" is discoverable rather than a secret. */
	private buildTab() {
		if (this.tab) return this.tab;
		// The shared walnut panel material (drawButton, not the static drawPanel), so this tab gets
		// the same idle/pressed feedback every other button in the revamp has (2026-09-15 UI revamp
		// phase 4, item 5) -- fixed at 44x44 either way. A separate transparent Rectangle is the tap
		// target, same reasoning as the pill's own hit rectangle below.
		const plate = this.scene.add.graphics();
		let pressed = false;
		const redrawPlate = () => drawButton(plate, TAB_SIZE.width, TAB_SIZE.height, pressed ? "pressed" : "idle", "walnut");
		redrawPlate();
		const hit = this.scene.add.rectangle(0, 0, TAB_SIZE.width, TAB_SIZE.height, 0x000000, 0).setOrigin(0);
		// A 16px pixel glyph at 2x (icon-menu / icon-chevron-up), same grid, outline and palette as
		// the rest of the icon set (2026-09-15 icon-grammar pass); it used to be a ☰/▴ Text glyph.
		const glyph = this.scene.add.image(TAB_SIZE.width / 2, TAB_SIZE.height / 2, "icon-menu").setScale(2);
		// The "new" pip (2026-09-15 UI revamp phase 4): a small accent dot in the tab's corner while
		// collapsed, if a row has been revealed since the panel was last opened -- see layout() for
		// when it is shown/hidden, and setCollapsed() for when the "last opened" set is refreshed.
		const pip = this.scene.add.circle(TAB_SIZE.width - 6, 6, 4, PALETTE.accent).setStrokeStyle(1, PALETTE.border, 1).setVisible(false);
		// includeChildren, so the hit rect Phaser hands back from a hit test carries scrollFactor 0
		// too -- that is how TouchControls recognises a touch as belonging to screen-pinned UI
		// rather than to the world underneath it.
		this.tab = this.scene.add.container(0, 0, [plate, hit, glyph, pip]).setScrollFactor(0, 0, true).setDepth(9501);
		hit.setInteractive({ useHandCursor: true });
		// Fires on release, not press (matching makeButton's own convention -- a tap that starts on
		// the tab but drags off before releasing must not toggle it).
		hit.on("pointerdown", () => {
			pressed = true;
			this.tab!.setScale(0.94);
			redrawPlate();
		});
		const release = () => {
			if (!pressed) return;
			pressed = false;
			this.tab!.setScale(1);
			redrawPlate();
		};
		hit.on("pointerup", () => {
			const wasPressed = pressed;
			release();
			if (wasPressed) this.setCollapsed(!this.collapsed);
		});
		hit.on("pointerout", release);
		(this.tab as unknown as { __glyph: Phaser.GameObjects.Image; __pip: Phaser.GameObjects.Arc }).__glyph = glyph;
		(this.tab as unknown as { __glyph: Phaser.GameObjects.Image; __pip: Phaser.GameObjects.Arc }).__pip = pip;
		return this.tab;
	}

	/** The collapsed-state objective pill, to the left of the tab. Tapping it expands the journal,
	 * same as the tab -- it is the journal, just folded. */
	private buildPill() {
		if (this.pill) return this.pill;
		// Graphics for the plate, not a Rectangle: a stroked Rectangle resized after creation (the
		// pill follows its text) left a stray diagonal across the plate -- the stroke path is only
		// rebuilt on construction. Graphics is redrawn per layout and has no such state. The
		// separate transparent Rectangle is the tap target (a transparent *fill* keeps it hittable,
		// same reason as the bakery's search-spot rectangles).
		this.pillPlate = this.scene.add.graphics();
		this.pillHit = this.scene.add.rectangle(0, 0, 10, TAB_SIZE.height, 0x000000, 0).setOrigin(1, 0);
		this.pillText = this.scene.add.text(0, 0, "", {
			padding: { x: 2, y: 3 }, resolution: 2, fontFamily: "Nunito, sans-serif",
			fontSize: "14px",
			fontStyle: "bold",
			color: PALETTE.css.text,
		}).setOrigin(1, 0.5);
		this.pillPointer = this.scene.add.graphics();
		this.pillPointer.lineStyle(2, PALETTE.panelLight).lineBetween(0, 22, 7, 22).lineBetween(3, 18, 7, 22).lineBetween(7, 22, 3, 26);
		this.pill = this.scene.add.container(0, 0, [this.pillPlate, this.pillHit, this.pillText, this.pillPointer]).setScrollFactor(0, 0, true).setDepth(9501);
		this.pill.setName("journal-objective");
		this.pillHit.setInteractive({ useHandCursor: true });
		// Scale-down press feedback, same convention as the tab (2026-09-15 UI revamp phase 4, item
		// 5) -- fires on release so a drag-off cancels it, same as every other button in the game.
		let pressed = false;
		this.pillHit.on("pointerdown", () => {
			pressed = true;
			this.pill!.setScale(0.94);
		});
		const release = () => {
			if (!pressed) return;
			pressed = false;
			this.pill!.setScale(1);
		};
		this.pillHit.on("pointerup", () => {
			const wasPressed = pressed;
			release();
			if (wasPressed) this.setCollapsed(false);
		});
		this.pillHit.on("pointerout", release);
		return this.pill;
	}

	private setCollapsed(collapsed: boolean) {
		if (collapsed === this.collapsed) return;
		if (!collapsed && this.scene.physics.world.isPaused && !this.scene.data.get("hud:modal")) return;
		this.collapsed = collapsed;
		this.scene.events.emit("hud:panel", "journal", !collapsed);
		this.scrollY = 0;
		getAudio(this.scene).sfx(collapsed ? "journal-close" : "journal-open", { volume: 0.6 });
		this.scene.game.registry.set(COLLAPSED_KEY, collapsed);
		if (collapsed) {
			// Close: fade the scrim and spring the panel out, THEN relayout to the final collapsed
			// (tab-only) form -- relayout up front would hide the rows before the fade could show them
			// going.
			this.setScrimVisible(false, true);
			closePanel(this.scene, this.container, () => this.layout());
		} else {
			this.scene.game.registry.set(UNREAD_KEY, false);
			this.noticeVisible = false;
			// Open: relayout to the expanded form first (so sizes/rows are correct for what's about
			// to spring in), then play the open animation and stagger the rows in on top of it.
			this.lastOpenedRevealedIds = new Set(this.visibleRows().map((r) => r.id));
			this.layout();
			this.setScrimVisible(true, true);
			openPanel(this.scene, this.container, { scale: 0.92, alpha: 0 });
			this.staggerRows();
		}
	}

	/** Fades the scrim in/out over the shared panel-open/close durations -- a no-op (scrim stays
	 * hidden) on anything wider/taller than a phone, per the task's "on phones" scope. `animate`
	 * false snaps straight to the target state, for the initial sync and for a resize mid-transition. */
	private setScrimVisible(show: boolean, animate: boolean) {
		if (!isPhoneViewport(this.scene)) {
			this.scrimRect.setVisible(false).setAlpha(0);
			return;
		}
		this.scene.tweens.killTweensOf(this.scrimRect);
		if (!animate || reducedMotion(this.scene)) {
			this.scrimRect.setVisible(show).setAlpha(show ? 0.45 : 0);
			return;
		}
		if (show) {
			this.scrimRect.setVisible(true).setAlpha(0);
			this.scene.tweens.add({ targets: this.scrimRect, alpha: 0.45, duration: MOTION.duration.panelOpen });
		} else {
			this.scene.tweens.add({
				targets: this.scrimRect,
				alpha: 0,
				duration: MOTION.duration.panelClose,
				onComplete: () => this.scrimRect.setVisible(false),
			});
		}
	}

	/** Rows stagger in 40ms apart (capped at 300ms total) when the panel springs open (2026-09-15
	 * UI revamp phase 4, mobile-ux research item 11) -- a no-op under reduced motion, where the
	 * rows simply appear at their already-correct (layout()'s) state. */
	private staggerRows() {
		if (reducedMotion(this.scene)) return;
		this.visibleRows().forEach((row, i) => {
			const el = this.rowElements.get(row.id);
			if (!el) return;
			const delay = staggerDelay(i);
			const boxScale = el.box.scale;
			this.scene.tweens.killTweensOf(el.box);
			el.box.setAlpha(0).setScale(boxScale * 0.7);
			this.scene.tweens.add({ targets: el.box, alpha: 1, scale: boxScale, delay, duration: 180, ease: "Back.easeOut" });
			const rest: Phaser.GameObjects.GameObject[] = [el.text, ...(el.icon ? [el.icon] : [])];
			this.scene.tweens.killTweensOf(rest);
			rest.forEach((t) => (t as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0));
			this.scene.tweens.add({ targets: rest, alpha: 1, delay, duration: 180, ease: "Quad.easeOut" });
		});
	}

	private endDrag = () => { this.dragY = null; };
	private onDrag = (p: Phaser.Input.Pointer) => {
		if (this.dragY === null || this.collapsed) return;
		const delta = this.dragY - p.y;
		this.dragY = p.y;
		this.scrollBy(delta);
	};
	private otherPanel = (id: string, open: boolean) => { if (id !== "journal" && open) this.setCollapsed(true); };
	private scrollBy(amount: number) {
		this.scrollY = Math.max(0, Math.min(this.scrollY + amount, this.contentHeight - this.scene.scale.height + 24));
		this.layout();
	}
	private onWheel = (_pointer: Phaser.Input.Pointer, _over: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
		if (!this.collapsed && this.container.visible) this.scrollBy(dy);
	};
	private onKey = (event: KeyboardEvent) => {
		if (event.code === "KeyJ" && !event.repeat && this.container.visible) {
			event.preventDefault();
			event.stopPropagation();
			if (!this.collapsed && !this.scene.data.get("hud:modal") && !this.scene.physics.world.isPaused) {
				this.scene.events.emit("hud:panel", "journal", true);
				this.setScrimVisible(true, true);
			} else this.setCollapsed(!this.collapsed);
			return;
		}
		if (this.collapsed || !this.container.visible) return;
		if (event.code === "Escape") { event.preventDefault(); event.stopPropagation(); this.setCollapsed(true); return; }
		if (!this.scene.data.get("hud:modal")) return;
		if (event.code === "Home" || event.code === "End") { event.preventDefault(); event.stopPropagation(); this.scrollBy(event.code === "Home" ? -this.contentHeight : this.contentHeight); }
		if (["ArrowDown", "PageDown", "ArrowUp", "PageUp"].includes(event.code)) {
			event.preventDefault(); event.stopPropagation(); this.scrollBy(event.code.endsWith("Down") ? 80 : -80);
		}
	};

	private layout = () => {
		const rows = this.visibleRows();
		const objective = currentObjective(this.gameState, this.sceneKey);
		const cakeCompleted = this.gameState.flag("cakeGiven");
		// The player's own text-size setting (Settings > Text size), as a multiplier re-applied
		// live on every layout -- a settings change re-runs this the same way a resize does.
		const scale = getTextScale(this.scene.game);
		// Half the screen on anything phone-sized or larger; on a 320px screen half is 160px and
		// every line wraps three times, so there the panel takes the width it needs (it folds away).
		const sw = this.scene.scale.width;
		const w = sw < 400 ? Math.min(sw - 24, 300) : Math.min(sw * 0.5, 300);

		// Measured, not fixed: a long line ("Teddy's Bakery, back through the arch") wraps inside
		// a 300px panel, and a fixed row height had it drawn over the Flour row. Every section
		// below follows the same rule -- set the content, then measure the real text object's own
		// height, rather than a guessed constant -- which is what fixed the hen row clipping its own
		// descenders against the panel's bottom edge (2026-09-14 audit).
		// The close tab is drawn over the panel's top-right corner, so the first row wraps short of
		// it -- at full panel width the line ran under the tab ("Find Teddy's supplies, 2/3").
		this.objectiveText.setFontSize(OBJECTIVE_FONT * scale).setText(objective ? `\u25B8 ${objective.text}` : "").setPosition(12, HEADER_HEIGHT + 14).setWordWrapWidth(w - 24 - TAB_SIZE.width - 6);
		const objRowH = objective ? this.objectiveText.height + SECTION_PAD * 2 : 0;
		const dinner = this.dinnerText();
		this.dinnerLabel.setFontSize(DINNER_FONT * scale).setText(dinner).setWordWrapWidth(w - 24);
		const dinnerRowH = dinner ? this.dinnerLabel.height + SECTION_PAD * 2 : 0;
		this.cakeHistoryLabel.setFontSize(NOTEBOOK_FONT * scale).setWordWrapWidth(w - 24);
		const cakeHistoryH = cakeCompleted ? this.cakeHistoryLabel.height + SECTION_PAD : 0;

		// Only reserve the errand and hen rows while they are shown (same conditions as render()),
		// or a finished errand leaves a blank block in the middle of the panel.
		const errandShown = this.gameState.hasStartedErrand() && !this.gameState.hasIngredient(QUEST.flourIngredientId);
		const henShown = this.gameState.hasMetPierre() && this.gameState.isMarketGateOpen() && !this.gameState.hasIngredient("eggs");

		this.errandLabel.setFontSize(ERRAND_FONT * scale);
		const errandRowH = errandShown ? Math.max(this.errandLabel.height, SUB_ITEM_ICON_SIZE) + SECTION_PAD * 2 : 0;

		const henCount = this.gameState.marketHensHomedCount();
		const henLabel = henCount >= HEN_IDS.length ? `Hens home: ${henCount}/${HEN_IDS.length} \u2713` : `Hens home: ${henCount}/${HEN_IDS.length}`;
		this.henProgressLabel.setFontSize(HEN_FONT * scale).setText(henLabel).setWordWrapWidth(w - 24);
		const henRowH = henShown ? this.henProgressLabel.height + SECTION_PAD * 2 : 0;

		const notebook = this.notebookText();
		this.notebookLabel.setFontSize(NOTEBOOK_FONT * scale).setText(notebook).setWordWrapWidth(w - 24);
		const notebookRowH = notebook ? this.notebookLabel.height + SECTION_PAD * 2 : 0;

		// Completed cake history uses two compact columns when they fit. Keep every real ingredient
		// slot: pre-cake reward flights and the collapsed tab destination still use these objects.
		rows.forEach(row => this.rowElements.get(row.id)!.text.setFontSize((cakeCompleted ? NOTEBOOK_FONT : ROW_FONT) * scale).setText(row.label).setWordWrapWidth(0));
		const rowColumns = cakeCompleted && rows.every(row => this.rowElements.get(row.id)!.text.width <= w / 2 - 72 - 12) ? 2 : 1;
		const rowWidth = w / rowColumns;
		const rowHeights = rows.map((row) => {
			const el = this.rowElements.get(row.id)!;
			el.text.setWordWrapWidth(rowWidth - 72 - 12);
			return Math.max(el.text.height, ROW_ICON_SIZE) + (cakeCompleted ? 8 : SECTION_PAD * 2);
		});
		const rowsTotalH = rowHeights.reduce((total, _height, i) => i % rowColumns === 0 ? total + Math.max(...rowHeights.slice(i, i + rowColumns)) : total, 0);

		const h = HEADER_HEIGHT + 16 + objRowH + dinnerRowH + cakeHistoryH + rowsTotalH + errandRowH + henRowH + notebookRowH;
		const x = this.scene.scale.width - w - 12;
		const y = 12;
		this.panelHit.setSize(w, h);
		this.contentHeight = h;
		this.scrollY = Math.min(this.scrollY, Math.max(0, h - this.scene.scale.height + 24));
		this.container.setPosition(x, y - this.scrollY);
		this.clip.clear().fillStyle(0xffffff).fillRect(x, y, w, Math.max(1, this.scene.scale.height - 24));

		const tab = this.buildTab();
		tab.setPosition(this.scene.scale.width - TAB_SIZE.width - 12, 12).setVisible(this.container.visible);
		// A fold-up chevron, not "x": the collapse control sits right beside a corner tab that
		// otherwise reads as "close the game" when expanded (2026-09-14 audit).
		(tab as unknown as { __glyph: Phaser.GameObjects.Image }).__glyph.setTexture(this.collapsed ? "icon-menu" : "icon-chevron-up");
		// The "new" pip: only meaningful while collapsed (it is the "there's something to open"
		// invitation) and only once its own row has actually been added to the checklist.
		const revealedIds = new Set(rows.map((r) => r.id));
		const hasNew = [...revealedIds].some((id) => !this.lastOpenedRevealedIds.has(id));
		(tab as unknown as { __pip: Phaser.GameObjects.Arc }).__pip.setVisible((hasNew || Boolean(this.scene.game.registry.get(UNREAD_KEY))) && this.collapsed);
		this.scrimRect.setSize(this.scene.scale.width, this.scene.scale.height);

		// Objective: a row inside the panel when open, a pill beside the tab when folded. Width
		// follows the text so a short line ("Tell Rafa") isn't a wide empty plate; capped so the
		// pill can never run under the tab or off the left edge on a 320px screen.
		const pill = this.buildPill();
		const showPill = (Boolean(objective) || this.noticeVisible) && this.collapsed && this.container.visible;
		pill.setVisible(showPill);
		this.pillPointer.setVisible(this.noticeVisible);
		if (objective || this.noticeVisible) {
			this.pillText.setFontSize(PILL_FONT * scale).setText([this.noticeVisible ? "Journal updated" : "", objective?.text ?? "A new notebook entry. Tap to read."].filter(Boolean).join("\n")).setWordWrapWidth(0);
			const maxPill = Math.min(this.scene.scale.width - TAB_SIZE.width - 12 - 12 - 8 - 12, 320);
			const pillW = Math.min(this.pillText.width + 22, maxPill);
			if (this.pillText.width + 22 > maxPill) this.pillText.setWordWrapWidth(maxPill - 22);
			const pillH = Math.max(TAB_SIZE.height, this.pillText.height + 12);
			// Drawn leftward from the container's origin, so the plate's right edge stays put beside
			// the tab regardless of how long the line is -- the Graphics object's own position (not
			// its drawn coordinates) carries that offset, so drawPanel can still draw its normal
			// (0,0)-(w,h) shape.
			this.pillPlate.setPosition(-pillW, 0);
			drawPanel(this.pillPlate, pillW, pillH, { variant: "cream" });
			// Hit area grown to the 44pt minimum (2026-09-15 UI revamp phase 4, item 5) without
			// growing the visual plate -- only matters for a very short objective label, since pillH
			// is already >= TAB_SIZE.height (44) by construction above.
			this.pillHit.setSize(Math.max(pillW, 44), Math.max(pillH, 44));
			this.pillText.setPosition(-11, pillH / 2);
			pill.setPosition(this.scene.scale.width - TAB_SIZE.width - 12 - 8, 12);
		}
		// Collapsed: only the tab remains, so nothing in the world's top-right corner is hidden. The
		// container keeps its layout either way -- getSubItemScreenPosition still needs real icon
		// slots to fly a picked-up item into, whether or not they are currently on screen.
		this.container.setAlpha(this.collapsed ? 0 : 1);
		for (const child of this.container.list) (child as Phaser.GameObjects.GameObject & { setVisible?: (v: boolean) => void }).setVisible?.(!this.collapsed);

		drawPanel(this.panel, w, h, { variant: "cream" });
		// Walnut header strip with the title, capping the panel's cream body -- same rounded-top,
		// flat-bottom shape a title bar gets in any of this material's other uses.
		this.header.clear();
		this.header.fillStyle(PALETTE.panelDark, 1);
		this.header.fillRoundedRect(0, 0, w, HEADER_HEIGHT, { tl: 8, tr: 8, bl: 0, br: 0 });
		this.headerTitle.setPosition(12, HEADER_HEIGHT / 2);

		let cursorY = HEADER_HEIGHT + 16 + objRowH;
		this.dinnerLabel.setPosition(12, cursorY + SECTION_PAD).setVisible(Boolean(dinner));
		cursorY += dinnerRowH;
		this.cakeHistoryLabel.setPosition(12, cursorY + SECTION_PAD / 2).setVisible(cakeCompleted);
		cursorY += cakeHistoryH;
		rows.forEach((row, i) => {
			const el = this.rowElements.get(row.id)!;
			const column = i % rowColumns;
			const columnX = column * rowWidth;
			const rh = Math.max(...rowHeights.slice(i - column, i - column + rowColumns));
			const boxH = 14 * CHECKBOX_SCALE;
			el.box.setPosition(columnX + 12, cursorY + rh / 2 - boxH / 2).setScale(CHECKBOX_SCALE);
			el.icon?.setPosition(columnX + 48, cursorY + rh / 2);
			el.text.setPosition(columnX + 72, cursorY + rh / 2 - el.text.height / 2);
			if (column === rowColumns - 1 || i === rows.length - 1) cursorY += rh;
		});

		const errandTop = cursorY;
		cursorY += errandRowH;
		const henTop = cursorY;
		cursorY += henRowH;
		const notebookTop = cursorY;
		cursorY += notebookRowH;

		this.errandLabel.setPosition(12, errandTop + errandRowH / 2 - this.errandLabel.height / 2);
		let iconX = 12 + this.errandLabel.width + 10;
		for (const icon of this.subItemIcons.values()) {
			icon.setPosition(iconX + SUB_ITEM_ICON_SIZE / 2, errandTop + errandRowH / 2);
			iconX += SUB_ITEM_ICON_SIZE + 6;
		}
		this.henProgressLabel.setPosition(12, henTop + henRowH / 2 - this.henProgressLabel.height / 2);
		this.notebookLabel.setPosition(12, notebookTop + notebookRowH / 2 - this.notebookLabel.height / 2).setVisible(Boolean(notebook));

		// The settings gear (SettingsUI.ts) reads this to stay below whatever this panel's current
		// bottom edge is, collapsed or expanded, so the two never overlap (2026-09-14 audit).
		this.scene.game.registry.set(JOURNAL_BOTTOM_KEY, this.collapsed ? 12 + TAB_SIZE.height : Math.min(12 + h, this.scene.scale.height - 12));

		this.render(rows);
	};

	private render(rows: JournalRow[]) {
		const revealedIds = new Set(rows.map((r) => r.id));
		for (const row of ROWS) {
			const el = this.rowElements.get(row.id)!;
			const revealed = revealedIds.has(row.id);
			el.box.setVisible(revealed);
			el.icon?.setVisible(revealed);
			el.text.setVisible(revealed);
			if (!revealed) continue;

			const checked = !row.locked && this.gameState.hasIngredient(row.id);
			this.drawCheckbox(el.box, row.locked, checked);
			el.text.setText(row.label).setColor(row.locked ? PALETTE.css.disabled : this.gameState.flag("cakeGiven") ? PALETTE.css.textMuted : PALETTE.css.text);
			el.icon?.setAlpha(row.locked ? 0.4 : 1);

			// Just-revealed (not just "visible this frame") -- pop it in once, matching show()'s
			// own tween shape rather than an instant appearance mid-session. The checkbox's own
			// scale (CHECKBOX_SCALE, already applied by layout() above) is its target, not 1 --
			// tweening straight to 1 would leave it visibly smaller than every other row's box.
			if (!this.revealedRowsLast.has(row.id) && !reducedMotion(this.scene)) {
				const boxScale = el.box.scale;
				el.box.setScale(boxScale * 0.5).setAlpha(0);
				this.scene.tweens.add({ targets: el.box, scale: boxScale, alpha: 1, duration: 220, ease: "Back.easeOut" });
				const rest = [el.text, ...(el.icon ? [el.icon] : [])];
				rest.forEach((t) => t.setScale(0.5).setAlpha(0));
				this.scene.tweens.add({ targets: rest, scale: 1, alpha: 1, duration: 220, ease: "Back.easeOut" });
			}
		}
		this.revealedRowsLast = revealedIds;

		const errandActive = this.gameState.hasStartedErrand() && !this.gameState.hasIngredient(QUEST.flourIngredientId);
		this.errandLabel.setVisible(errandActive);
		const justStarted = errandActive && !this.errandWasActive;
		this.errandWasActive = errandActive;
		let staggerIndex = 0;
		this.subItemIcons.forEach((icon, id) => {
			const collected = this.gameState.hasBakeryItem(id) && !this.heldSubItems.has(id);
			icon.setVisible(errandActive);
			if (collected) {
				icon.clearTint().setAlpha(1);
				if (!this.subItemCollectedLast.has(id) && !reducedMotion(this.scene)) {
					this.scene.tweens.add({ targets: icon, scale: { from: SUB_ITEM_ICON_SIZE / icon.width + 0.5, to: SUB_ITEM_ICON_SIZE / icon.width }, duration: 220, ease: "Back.easeOut" });
				}
			} else {
				icon.setTint(PALETTE.disabled).setAlpha(0.4);
			}
			// The errand just started -- pop the sub-items in one after another instead of all at
			// once, so the checklist visibly builds itself rather than snapping into existence.
			if (justStarted && errandActive && !reducedMotion(this.scene)) {
				const targetScale = SUB_ITEM_ICON_SIZE / icon.width;
				icon.setScale(0).setAlpha(0);
				this.scene.tweens.add({
					targets: icon,
					scale: targetScale,
					alpha: 1,
					duration: 200,
					ease: "Back.easeOut",
					delay: staggerIndex * 120,
				});
			}
			staggerIndex += 1;
		});
		this.subItemCollectedLast = new Set([...this.subItemIcons.keys()].filter((id) => this.gameState.hasBakeryItem(id) && !this.heldSubItems.has(id)));

		const henCount = this.gameState.marketHensHomedCount();
		// Stays visible through completion (3/3) instead of hiding the instant the count hits
		// HEN_IDS.length -- previously it vanished the same frame the herd finished, with no
		// completion state ever shown, reading as if there'd been no indicator at all. It now hides
		// only once Pierre's actually handed off the eggs reward for it, matching how the bakery
		// errand's own sub-items stay checked off rather than disappearing on completion.
		const henActive = this.gameState.hasMetPierre() && this.gameState.isMarketGateOpen() && !this.gameState.hasIngredient("eggs");
		const henLabel = henCount >= HEN_IDS.length ? `Hens home: ${henCount}/${HEN_IDS.length} ✓` : `Hens home: ${henCount}/${HEN_IDS.length}`;
		this.henProgressLabel.setText(henLabel).setVisible(henActive);
	}

	private dinnerText(): string {
		if (this.gameState.flag("dinnerRevealed")) return "Dinner · Ichika";
		if (!this.gameState.flag("dinnerStarted")) return "";
		return "Dinner keepsakes\n" + DINNER_CLUES.map(clue => this.gameState.flag(clue.flag) ? `✓ ${clue.label}` : "○ Undiscovered treasure").join("\n");
	}

	/** The optional notebook's text, or "" while there is nothing to show yet. */
	private notebookText(): string {
		const found = new Set(this.gameState.countKeys("propSeen:").map((k) => k.slice("propSeen:".length)));
		const rooms = (Object.entries(PROP_THOUGHTS) as [string, { id: string }[]][])
			.map(([scene, list]) => ({ scene, total: list.length, got: list.filter((p) => found.has(p.id)).length }));
		const thoughtsGot = rooms.reduce((a, r) => a + r.got, 0);
		const thoughtsTotal = rooms.reduce((a, r) => a + r.total, 0);
		const watered = this.gameState.count("windowBoxWatered");
		const stage = [...WINDOW_BOX.stages].reverse().find((st) => watered >= st.at);
		const boxText = watered === 0 ? null : stage ? stage.texture.replace("flower-", "") : "watered";
		if (thoughtsGot === 0 && watered === 0) return "";
		// Two short lines, not a paragraph: the per-room breakdown only once something is found.
		const line1 = [`Sniffed ${thoughtsGot}/${thoughtsTotal}`];
		if (boxText) line1.push(`box: ${boxText}`);
		const roomBits = rooms.filter((r) => r.got > 0).map((r) => `${r.scene === "Apartment" ? "home" : r.scene.toLowerCase()} ${r.got}/${r.total}`);
		return `Frankie's notebook · ${line1.join(" · ")}` + (roomBits.length ? `\n${roomBits.join(", ")}` : "");
	}

	/** A 14x14 checkbox: filled+checkmark when done, empty outline when open, a tiny padlock
	 * (body + shackle arc) when locked -- drawn rather than imaged since it's flat two-tone
	 * geometry, the same reasoning that moved the panel frame off PixelLab. */
	private drawCheckbox(g: Phaser.GameObjects.Graphics, locked: boolean, checked: boolean) {
		g.clear();
		// Whole-pixel rectangles only: a stroked path or arc anti-aliases into a soft grey smear next
		// to the pixel-art ingredient icons (2026-09-15 icon-grammar pass).
		const px = (x: number, y: number, w = 1, h = 1) => g.fillRect(x, y, w, h);
		if (locked) {
			g.fillStyle(PALETTE.disabled, 1);
			px(4, 2, 1, 4); px(9, 2, 1, 4); px(5, 1, 4, 1); // shackle
			px(2, 6, 10, 7); // body
			g.fillStyle(PALETTE.panelLight, 1);
			px(6, 8, 2, 2); px(6, 10, 2, 1); // keyhole
			return;
		}
		g.fillStyle(PALETTE.border, 1);
		px(1, 0, 12, 2); px(1, 12, 12, 2); px(0, 1, 2, 12); px(12, 1, 2, 12); // 2px frame
		if (checked) {
			// Checklist ticks use `success` (docs/research/2026-09-15-ui-revamp.md §3.4 item 5).
			g.fillStyle(PALETTE.success, 1);
			px(2, 2, 10, 10);
			g.fillStyle(PALETTE.panelLight, 1);
			for (const [x, y] of [[3, 6], [4, 7], [5, 8], [6, 9], [7, 8], [8, 7], [9, 6], [10, 5], [11, 4]]) px(x, y, 1, 2);
		}
	}

	/** The root object attachGameplay hides from the world/zoomed camera. */
	get gameObject(): Phaser.GameObjects.Container {
		return this.container;
	}

	/** Everything this UI owns, for the same one-shot camera snapshot -- the collapse tab lives
	 * outside the panel container so it stays visible when the panel is hidden. */
	get gameObjects(): Phaser.GameObjects.GameObject[] {
		return [this.container, ...(this.tab ? [this.tab] : []), ...(this.pill ? [this.pill] : []), this.clip];
	}

	/** The scrim behind the expanded panel -- kept out of `gameObjects` above (attachGameplay's
	 * one-shot snapshot spreads that array verbatim elsewhere) but still needs the same
	 * world/zoomed-camera hiding; attachGameplay adds it alongside `...journal.gameObjects`. */
	get scrim(): Phaser.GameObjects.Rectangle {
		return this.scrimRect;
	}

	/** Screen-space position of a bakery errand item's icon slot (container position + local
	 * icon position, since the container itself is already screen-space via scrollFactor(0)) --
	 * so the pickup-and-fly animation can land exactly on the icon it's checking off, not a
	 * generic point near the panel. Null if that item has no icon slot (texture missing) or the
	 * journal isn't laid out yet. */
	/** Keep an item's checklist slot dim while its pickup animation plays; release() pops it. The
	 * save is written at pickup either way, so leaving the room mid-flight loses nothing. */
	holdSubItem(id: string) {
		this.heldSubItems.add(id);
	}

	releaseSubItem(id: string) {
		if (!this.heldSubItems.delete(id)) return;
		this.layout();
	}

	getSubItemScreenPosition(id: string): { x: number; y: number } | null {
		const icon = this.subItemIcons.get(id);
		if (!icon) return null;
		return { x: this.container.x + icon.x, y: this.container.y + icon.y };
	}

	/** Screen-space target for an ingredient flying into the journal: the row's icon when the
	 * panel is open, the corner tab when it is folded (a phone), so the arc always lands on
	 * something the player can see. Null before the journal is shown. */
	getIngredientScreenPosition(id: string): { x: number; y: number } | null {
		if (!this.container.visible) return null;
		const el = this.rowElements.get(id);
		if (!this.collapsed && el && el.icon?.visible) return { x: this.container.x + el.icon.x, y: this.container.y + el.icon.y };
		if (!this.collapsed && el && el.box.visible) return { x: this.container.x + el.box.x + 9, y: this.container.y + el.box.y + 9 };
		if (!this.collapsed && !el) return { x: this.container.x + 24, y: this.container.y + 16 };
		if (this.tab?.visible) return { x: this.tab.x + TAB_SIZE.width / 2, y: this.tab.y + TAB_SIZE.height / 2 };
		return null;
	}

	/** The "stamp": the row's checkbox and icon pop as the flying ingredient lands on them (the
	 * check itself is already drawn from GameState by then). Folded, the tab pops instead. */
	stampRow(id: string) {
		if (reducedMotion(this.scene)) { this.pulse(); return; }
		const el = this.rowElements.get(id);
		if (!this.collapsed && el && el.box.visible) {
			const boxScale = el.box.scale;
			this.scene.tweens.killTweensOf(el.box);
			el.box.setScale(boxScale * 1.6);
			this.scene.tweens.add({ targets: el.box, scale: boxScale, duration: 260, ease: "Back.easeOut" });
			if (el.icon) {
				this.scene.tweens.killTweensOf(el.icon);
				el.icon.setScale(1.35, 0.75);
				this.scene.tweens.add({ targets: el.icon, scaleX: 1, scaleY: 1, duration: 260, ease: "Back.easeOut" });
			}
		} else if (this.tab) {
			this.scene.tweens.killTweensOf(this.tab);
			this.tab.setScale(1.3);
			this.scene.tweens.add({ targets: this.tab, scale: 1, duration: 260, ease: "Back.easeOut" });
		}
		this.pulse();
	}

	/** A quick "received" bounce, for when a fetch item finishes flying in from the world. */
	pulse() {
		getAudio(this.scene).sfx("journal-tick");
		if (reducedMotion(this.scene)) return;
		this.scene.tweens.add({
			targets: this.collapsed ? this.tab : this.container,
			scale: 1.15,
			duration: 90,
			yoyo: true,
			ease: "Quad.easeOut",
		});
	}

	show() {
		this.container.setVisible(true);
		this.tab?.setVisible(true);
		this.layout();
		if (this.collapsed) {
			// Collapsed: only the tab needs to appear, no panel-open animation or scrim to speak of.
			this.container.setAlpha(0).setScale(1);
		} else {
			openPanel(this.scene, this.container, { scale: 0.9, alpha: 0 });
			this.setScrimVisible(true, true);
		}
	}

	hide() {
		this.container.setVisible(false);
		this.tab?.setVisible(false);
		this.pill?.setVisible(false);
		this.setScrimVisible(false, false);
	}
}
