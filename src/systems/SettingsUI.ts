import Phaser from "phaser";
import { PALETTE } from "./palette";
import { drawPanel, makeButton, ButtonHandle, MakeButtonOptions } from "./panel";
import { addPixelText } from "./pixelText";
import { DEFAULT_ZOOM_SCALE, ZOOM_SCALES, getZoomScale, reapplyRoomZoom, setZoomScale } from "./cameraFit";
import { getAudio } from "./audio";
import { TEXT_SCALES, TEXT_SCALE_CHANGED, TextScale, getTextScale, setTextScale } from "./textScale";
import { TEXT_SPEEDS, TextSpeed, getTextSpeed, setTextSpeed } from "./textSpeed";
import { getJoystickSide, joystickSideLabel, nextJoystickSide, setJoystickSide } from "./TouchControls";
import { JOURNAL_BOTTOM_KEY, isPhoneViewport } from "./JournalUI";
import { readReducedMotionSetting, setReducedMotion, reducedMotion } from "./juice";
import { MOTION, openPanel, closePanel } from "./motion";

const TAB_SIZE = { width: 44, height: 44 };
/** Gap kept between this gear and whatever it is stacking below (the journal tab, or the
 * journal's own expanded panel bottom -- see layout()). */
const TAB_GAP = 8;
const PANEL = { width: 260, height: 428 };
/** Vertical distance between each interactive row's own y -- at least the 44pt minimum tap
 * target (2026-09-15 UI revamp phase 4, item 5: makeButton grows every button's hit area to
 * 44x44) plus a few px of dead zone, so two adjacent rows' grown hit areas never overlap. */
const ROW_PITCH = 48;

/**
 * A small settings panel behind a gear tab in the HUD corner.
 *
 * View zoom, text size, reduced motion, joystick side, and sound. The rooms are authored around a
 * desktop zoom and stepped down once for narrow viewports (see roomZoom), which covers "phone vs
 * laptop" but not the range of things people actually play on or the range of eyesight they play
 * with -- a fixed pair of steps is a guess about the device, not an answer to the player. This lets
 * them say.
 *
 * Deliberately discrete -/+ steps (and discrete on/off/left/right toggles) over drag sliders: a
 * slider is the fiddliest possible control on the smallest screens, which are exactly the ones
 * this exists for, and every one of these settings is a short fixed list anyway.
 *
 * The sheet is walnut (`panelDark`), the one dark panel in the game by design (docs/research/
 * 2026-09-15-ui-revamp.md §3.1) -- every button on it (including this gear tab) is `makeButton`,
 * so idle/pressed/disabled all share the same material as the rest of the revamp.
 */
export class SettingsUI {
	private tab: ButtonHandle;
	private buttons: ButtonHandle[] = [];
	private focused = 0;
	private basePositions = new Map<Phaser.GameObjects.GameObject, { x: number; y: number }>();
	private rowLabels: Phaser.GameObjects.Text[] = [];
	private backdrop!: Phaser.GameObjects.Graphics;
	private panelHit!: Phaser.GameObjects.Rectangle;
	private panel: Phaser.GameObjects.Container;
	private valueLabel: Phaser.GameObjects.Text;
	private minusButton!: ButtonHandle;
	private plusButton!: ButtonHandle;
	private textScaleButtons: { scale: TextScale; button: ButtonHandle }[] = [];
	private textSpeedButtons: { speed: TextSpeed; button: ButtonHandle }[] = [];
	private reducedMotionButton!: ButtonHandle;
	private joystickButton!: ButtonHandle;
	private soundButton!: ButtonHandle;
	private open = false;
	/** Dims the world behind the sheet on a phone (2026-09-15 UI revamp phase 4) -- same treatment
	 * as JournalUI's own scrim, and for the same reason (a modal sheet needs a focus cue, not just
	 * a floating box). Exposed via the `scrim` getter for attachGameplay's UI-camera snapshot. */
	private scrimRect: Phaser.GameObjects.Rectangle;

	constructor(private scene: Phaser.Scene) {
		this.tab = this.buildTab();
		const built = this.buildPanel();
		this.panel = built.container;
		this.valueLabel = built.value;
		this.buttons = this.buttons.filter(b => b !== this.tab);
		for (const child of this.panel.list) { const o = child as Phaser.GameObjects.Container; this.basePositions.set(child, { x: o.x, y: o.y }); }
		scene.input.keyboard?.on("keydown", this.onKey);
		scene.events.on("hud:panel", this.otherPanel);
		// fillAlpha 1, not 0 -- that argument is the shape's OWN fill opacity (baked in once), separate
		// from the GameObject's `.alpha` this class fades via tween/setAlpha below; leaving it at 0
		// would multiply out to invisible no matter what `.alpha` is set to afterwards.
		this.scrimRect = scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, PALETTE.shadow, 1)
			.setOrigin(0)
			.setScrollFactor(0, 0)
			.setDepth(9500)
			.setVisible(false)
			.setAlpha(0)
			.setInteractive();
		this.scrimRect.on("pointerdown", () => this.setOpen(false));
		this.refresh();
		this.layout();
		scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
		// The journal (JournalUI.ts) writes its current bottom edge here every time it lays out --
		// collapsed (just its tab) or expanded (the full checklist, whatever height that turns out
		// to be) -- so this gear (and the panel under it) can stay below it and the two never
		// overlap, without either file needing a direct reference to the other's instance.
		const journalBottomChanged = `changedata-${JOURNAL_BOTTOM_KEY}`;
		scene.game.registry.events.on(journalBottomChanged, this.layout, this);
		scene.game.registry.events.on(TEXT_SCALE_CHANGED, this.layout, this);
		scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
			scene.input.keyboard?.off("keydown", this.onKey);
			scene.events.off("hud:panel", this.otherPanel);
			scene.game.registry.events.off(journalBottomChanged, this.layout, this);
			scene.game.registry.events.off(TEXT_SCALE_CHANGED, this.layout, this);
		});
	}

	/** Everything this UI owns, for attachGameplay's one-shot UI-camera snapshot. */
	get gameObjects(): Phaser.GameObjects.GameObject[] {
		return [this.tab, this.panel, this.scrimRect];
	}

	/** A `makeButton` wrapped with this panel's click sound -- every button on the sheet shares it. */
	private button(x: number, y: number, label: string, onTap: () => void, opts: MakeButtonOptions = {}) {
		const button = makeButton(
			this.scene,
			x,
			y,
			label,
			() => {
				getAudio(this.scene).sfx("ui-click", { volume: 0.5 });
				onTap();
			},
			{ variant: "walnut", font: "body", fontSize: 15, ...opts }
		);
		this.buttons.push(button);
		return button;
	}

	private buildTab() {
		const gear = this.button(0, 0, "", () => this.setOpen(!this.open), { width: TAB_SIZE.width, height: TAB_SIZE.height });
		// The label text is empty but still created by makeButton -- drop it and draw the gear glyph
		// in its place, same reasoning DialogueBox has for drawing its own portrait ring instead of
		// loading a PNG for a small flat two-tone shape.
		(gear.list[1] as Phaser.GameObjects.Text).destroy();
		// The gear is a 16px pixel glyph at 2x (public/assets/icons/icon-gear.png), on the same grid,
		// outline and palette as every other icon -- the 2026-09-15 icon-grammar pass replaced the
		// anti-aliased Graphics cog that sat next to pixel-art icons.
		const icon = this.scene.add.image(TAB_SIZE.width / 2, TAB_SIZE.height / 2, "icon-gear").setScale(2);
		gear.add(icon);
		gear.setScrollFactor(0, 0, true).setDepth(9502);
		return gear;
	}

	private buildPanel() {
		const backdrop = this.backdrop = this.scene.add.graphics();
		drawPanel(backdrop, PANEL.width, PANEL.height, { variant: "walnut" });
		const hit = this.panelHit = this.scene.add.rectangle(0, 0, PANEL.width, PANEL.height, 0x000000, 0).setOrigin(0).setInteractive();
		const title = addPixelText(this.scene, 14, 12, "Settings [Esc]", { scale: 1, tint: PALETTE.panelLight });
		const rowLabelStyle = {
			padding: { x: 2, y: 3 }, resolution: 2, fontFamily: "Nunito, sans-serif",
			fontSize: "15px",
			color: PALETTE.css.panelLight,
		};
		// Every interactive row's button sits at `42 + i * ROW_PITCH`, its heading 6px below that --
		// ROW_PITCH (48) is at least the 44pt minimum tap target makeButton now grows every button's
		// hit area to, so two adjacent rows' hit areas never overlap (2026-09-15 UI revamp phase 4,
		// item 5).
		const rowY = (i: number) => 42 + i * ROW_PITCH;

		const zoomLabel = this.scene.add.text(14, rowY(0) + 6, "View zoom", rowLabelStyle);
		this.minusButton = this.button(PANEL.width - 132, rowY(0), "−", () => this.step(-1), { width: 30, height: 28, fontSize: 18 });
		const value = this.scene.add.text(PANEL.width - 69, rowY(0) + 14, "", { padding: { x: 2, y: 3 }, resolution: 2, fontFamily: "Nunito, sans-serif", fontSize: "15px", color: PALETTE.css.panelLight }).setOrigin(0.5);
		this.plusButton = this.button(PANEL.width - 44, rowY(0), "+", () => this.step(1), { width: 30, height: 28, fontSize: 18 });

		// Text size: a 3-way segmented control (100/125/150%) rather than +/- steps -- there are only
		// three values, and seeing all of them at once shows which is active without a separate
		// readout the way the zoom stepper needs one. The active segment is `selected` (accent fill,
		// `text`-colored label) -- see refresh().
		const textSizeLabel = this.scene.add.text(14, rowY(1) + 6, "Text size", rowLabelStyle);
		const segW = 50;
		const segGap = 4;
		const segStartX = PANEL.width - 12 - (segW * TEXT_SCALES.length + segGap * (TEXT_SCALES.length - 1));
		this.textScaleButtons = TEXT_SCALES.map((scale, i) => ({
			scale,
			button: this.button(segStartX + i * (segW + segGap), rowY(1), `${Math.round(scale * 100)}%`, () => this.applyTextScale(scale), { width: segW, height: 24, fontSize: 14 }),
		}));

		// Text speed: same segmented pattern as text size, three fixed rates the typewriter reads
		// directly (textSpeed.ts) -- 2026-09-15 UI revamp phase 4, mobile-ux research item 3. "Speed"
		// not "Text speed" -- the row directly below "Text size" already gives it context, and the
		// longer label was overlapping the segments in a 260px panel ("Normal" needs a wider segment
		// than the text-size row's "125%" does).
		const textSpeedLabel = this.scene.add.text(14, rowY(2) + 6, "Speed", rowLabelStyle);
		const speedSegW = 56;
		const speedSegStartX = PANEL.width - 12 - (speedSegW * TEXT_SPEEDS.length + segGap * (TEXT_SPEEDS.length - 1));
		const speedLabel: Record<TextSpeed, string> = { slow: "Slow", normal: "Normal", fast: "Fast" };
		this.textSpeedButtons = TEXT_SPEEDS.map((speed, i) => ({
			speed,
			button: this.button(speedSegStartX + i * (speedSegW + segGap), rowY(2), speedLabel[speed], () => this.applyTextSpeed(speed), { width: speedSegW, height: 24, fontSize: 14 }),
		}));

		const reducedMotionHeading = this.scene.add.text(14, rowY(3) + 6, "Reduced motion", rowLabelStyle);
		this.reducedMotionButton = this.button(PANEL.width - 88, rowY(3), "", () => {
			setReducedMotion(this.scene.game, !readReducedMotionSetting(this.scene.game));
			this.refresh();
		}, { width: 74, height: 28 });

		const joystickHeading = this.scene.add.text(14, rowY(4) + 6, "Joystick", rowLabelStyle);
		this.joystickButton = this.button(PANEL.width - 88, rowY(4), "", () => {
			setJoystickSide(this.scene.game, nextJoystickSide(getJoystickSide(this.scene.game)));
			this.refresh();
		}, { width: 74, height: 28 });

		const soundHeading = this.scene.add.text(14, rowY(5) + 6, "Sound", rowLabelStyle);
		this.soundButton = this.button(PANEL.width - 88, rowY(5), "", () => {
			const audio = getAudio(this.scene.game.scene.getScenes(true)[0] ?? this.scene);
			audio.setMuted(!audio.isMuted());
			this.refresh();
		}, { width: 74, height: 28 });

		const done = this.button(PANEL.width - 88, rowY(6), "Done", () => this.setOpen(false), { width: 74, height: 28 });
		const reset = this.button(14, rowY(6), "Reset zoom", () => this.apply(DEFAULT_ZOOM_SCALE), { width: 110, height: 28 });
		const credits = this.button(14, rowY(7), "Audio credits", () => window.open(`${import.meta.env.BASE_URL}credits.html`, "_blank", "noopener"), { width: 132, height: 28 });
		this.rowLabels = [zoomLabel, textSizeLabel, textSpeedLabel, reducedMotionHeading, joystickHeading, soundHeading];

		const container = this.scene.add.container(0, 0, [
			backdrop, hit, title, zoomLabel,
			this.minusButton, value, this.plusButton,
			textSizeLabel, ...this.textScaleButtons.map((b) => b.button),
			textSpeedLabel, ...this.textSpeedButtons.map((b) => b.button),
			reducedMotionHeading, this.reducedMotionButton,
			joystickHeading, this.joystickButton,
			soundHeading, this.soundButton,
			reset, done, credits,
		]).setScrollFactor(0, 0, true).setDepth(9503).setVisible(false);
		return { container, value };
	}

	private step(direction: 1 | -1) {
		const current = ZOOM_SCALES.indexOf(getZoomScale(this.scene.game) as (typeof ZOOM_SCALES)[number]);
		const from = current === -1 ? ZOOM_SCALES.indexOf(DEFAULT_ZOOM_SCALE) : current;
		this.apply(ZOOM_SCALES[Phaser.Math.Clamp(from + direction, 0, ZOOM_SCALES.length - 1)]);
	}

	private apply(scale: number) {
		setZoomScale(this.scene.game, scale);
		// Applied here rather than by each scene: reapplyRoomZoom reads the room size back off the
		// camera bounds the scene already set, so no scene needs to know this setting exists.
		reapplyRoomZoom(this.scene.cameras.main);
		this.refresh();
	}

	private applyTextScale(scale: TextScale) {
		// The registry write alone re-lays out both DialogueBox and JournalUI live: each subscribes
		// to this key's own `changedata` event (see TEXT_SCALE_CHANGED in textScale.ts) the same way
		// the settings gear subscribes to the journal's bottom-edge key below.
		setTextScale(this.scene.game, scale);
		this.refresh();
	}

	private applyTextSpeed(speed: TextSpeed) {
		// Read directly by DialogueBox's typewriter at the start of each page -- see textSpeed.ts.
		setTextSpeed(this.scene.game, speed);
		this.refresh();
	}

	private refresh() {
		const scale = getZoomScale(this.scene.game);
		this.valueLabel.setText(`${Math.round(scale * 100)}%`);
		// Disabled (not just faded), so the range has visible ends whose buttons genuinely stop
		// responding rather than just looking dim while still tappable.
		const index = ZOOM_SCALES.indexOf(scale as (typeof ZOOM_SCALES)[number]);
		this.minusButton.setDisabled(index <= 0);
		this.plusButton.setDisabled(index >= ZOOM_SCALES.length - 1);

		const textScale = getTextScale(this.scene.game);
		for (const btn of this.textScaleButtons) btn.button.setSelected(btn.scale === textScale);

		const textSpeed = getTextSpeed(this.scene.game);
		for (const btn of this.textSpeedButtons) btn.button.setSelected(btn.speed === textSpeed);

		this.reducedMotionButton.setLabel(readReducedMotionSetting(this.scene.game) ? "On" : "Off");
		this.joystickButton.setLabel(joystickSideLabel(getJoystickSide(this.scene.game)));
		this.soundButton.setLabel(getAudio(this.scene).isMuted() ? "Off" : "On");
	}

	/** Fades the scrim in/out over the shared panel-open/close durations, same as JournalUI's own
	 * (see its setScrimVisible) -- a no-op on anything wider/taller than a phone. */
	private setScrimVisible(show: boolean) {
		if (!isPhoneViewport(this.scene)) {
			this.scrimRect.setVisible(false).setAlpha(0);
			return;
		}
		this.scene.tweens.killTweensOf(this.scrimRect);
		if (reducedMotion(this.scene)) {
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

	private setOpen(open: boolean) {
		if (open === this.open) return;
		if (open && this.scene.physics.world.isPaused && !this.scene.data.get("hud:modal")) return;
		this.open = open;
		this.scene.events.emit("hud:panel", "settings", open);
		this.tab.setFocused(!open);
		this.buttons.forEach(b => b.setFocused(false));
		this.focused = Math.max(0, this.buttons.findIndex(b => !b.isDisabled()));
		if (open) this.buttons[this.focused]?.setFocused(true);
		this.layout();
		if (open) {
			this.refresh();
			this.panel.setVisible(true);
			this.setScrimVisible(true);
			// Springs open the same way every other panel in the revamp does (2026-09-15 UI revamp
			// phase 4, item 4/6).
			openPanel(this.scene, this.panel, { scale: 0.92, alpha: 0 });
		} else {
			this.setScrimVisible(false);
			closePanel(this.scene, this.panel, () => this.panel.setVisible(false));
		}
	}

	private otherPanel = (id: string, open: boolean) => { if (id !== "settings" && open) this.setOpen(false); };
	private onKey = (event: KeyboardEvent) => {
		if (event.repeat) return;
		if (event.code === "KeyO") { event.preventDefault(); event.stopPropagation(); this.setOpen(!this.open); return; }
		if (!this.open) return;
		if (event.code === "Escape") { event.preventDefault(); event.stopPropagation(); this.setOpen(false); return; }
		const enabled = this.buttons.map((b, i) => b.isDisabled() ? -1 : i).filter(i => i >= 0);
		if (event.code === "Tab" || event.code.startsWith("Arrow")) {
			event.preventDefault();
			event.stopPropagation();
			const back = event.shiftKey || event.code === "ArrowLeft" || event.code === "ArrowUp";
			this.focused = enabled[(enabled.indexOf(this.focused) + (back ? -1 : 1) + enabled.length) % enabled.length];
			this.buttons.forEach(b => b.setFocused(false));
			this.buttons[this.focused]?.setFocused(true);
		} else if (event.code === "Enter" || event.code === "Space") {
			event.preventDefault(); event.stopPropagation(); this.buttons[this.focused]?.activate();
		}
	};

	private layout = () => {
		const { width, height } = this.scene.scale;
		this.scrimRect.setSize(width, height);
		// Below whatever the journal's own bottom edge currently is (JournalUI.ts writes this every
		// time it lays out, collapsed or expanded) so this gear -- and the panel under it -- never
		// overlap the journal regardless of how tall its checklist gets (2026-09-14 audit). Falls
		// back to the old fixed offset (just under a 44px tab) before the journal's first layout.
		const journalBottom = (this.scene.game.registry.get(JOURNAL_BOTTOM_KEY) as number | undefined) ?? (12 + TAB_SIZE.height);
		const gearY = Math.min(height - TAB_SIZE.height - 8, Math.max(12 + TAB_SIZE.height + TAB_GAP, journalBottom + TAB_GAP));
		this.tab.setPosition(width - TAB_SIZE.width - 12, gearY);
		this.tab.setVisible(this.open || journalBottom + TAB_SIZE.height + TAB_GAP <= height);
		// Pinned to the same right margin as the tab, just under it, and nudged back on screen if the
		// panel is wider than the margin allows (a 320px-wide phone).
		const columns = height < 500 && width >= 560 ? 2 : 1;
		const textScale = getTextScale(this.scene.game);
		this.rowLabels.forEach(label => label.setFontSize(15 * textScale));
		const columnW = Math.min(Math.floor((width - 24 - (columns - 1) * 16) / columns), PANEL.width + Math.round((textScale - 1) * 100));
		const panelW = columnW * columns + (columns - 1) * 16;
		const panelH = columns === 2 ? 236 : PANEL.height;
		for (const [child, pos] of this.basePositions) {
			const row = Math.floor((pos.y - 42) / ROW_PITCH);
			const o = child as Phaser.GameObjects.Container;
			const x = pos.x + ((row >= 0 && row <= 5 && (this.buttons.includes(child as ButtonHandle) || child === this.valueLabel)) || (row === 6 && pos.x > 100) ? columnW - PANEL.width : 0);
			if (row >= 0 && row <= 5 && columns === 2) o.setPosition(x + Math.floor(row / 3) * (columnW + 16), pos.y - Math.floor(row / 3) * 3 * ROW_PITCH);
			else if (row === 6 && columns === 2) o.setPosition(pos.x > 100 ? panelW - 88 : pos.x, pos.y - 3 * ROW_PITCH);
			else if (row === 7 && columns === 2) o.setPosition(160, 186);
			else o.setPosition(x, pos.y);
		}
		drawPanel(this.backdrop, panelW, panelH, { variant: "walnut" });
		this.panelHit.setSize(panelW, panelH);
		const x = Math.max(8, width - panelW - 12);
		const y = Math.max(8, Math.min(gearY + TAB_SIZE.height + TAB_GAP, height - panelH - 8));
		this.panel.setPosition(x, y);
	};
}
