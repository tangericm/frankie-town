import Phaser from "phaser";
import { DialogueLine, DialogueSequencer, DialoguePhase } from "./DialogueSequencer";
import { PALETTE } from "./palette";
import { drawPanel } from "./panel";
import { addPixelText } from "./pixelText";
import { TEXT_SCALE_CHANGED, getTextScale } from "./textScale";
import { charDelayMs, getTextSpeed } from "./textSpeed";
import { MOTION, openPanel, closePanel } from "./motion";
import { reducedMotion } from "./juice";

/** Base (100%) body font sizes -- the text-size setting multiplies these live in layout(). The
 * name tag is a BitmapText (pixelText.ts) whose base size is the pixel-font atlas's own native
 * 16px, so it takes an integer *scale* from the same setting instead of a font-size number. */
const BODY_FONT_PLAIN = 18;
const BODY_FONT_GAG = 17;
/** Panel widths under this get the compact (1x, 64px) portrait -- see resizeAndDraw(). 520 is
 * comfortably above any phone-in-portrait panel (≤ ~400px) and below any landscape/desktop one
 * (≥ ~600px). Portrait scale is always an integer (1x or 2x) -- never fractional, so nearest-
 * neighbour scaling stays crisp at any viewport. */
const NARROW_PANEL_WIDTH = 520;
const PORTRAIT_SIZE_1X = 64;
const PORTRAIT_SIZE_2X = 128;
/** Desktop panels cap here and centre; phones keep the full-width-minus-margins panel below this
 * (see the `w` calc in resizeAndDraw()). */
const MAX_PANEL_WIDTH = 640;
const MIN_PANEL_HEIGHT = 120;
/** Ceiling on how tall a single page of body text is allowed to need before buildPages() splits
 * it into another page -- independent of the panel's own (content-sized) height, which is
 * whatever a page within this ceiling actually measures at. */
const MAX_BODY_TEXT_HEIGHT_FRACTION = 0.4;
const MAX_BODY_TEXT_HEIGHT_CAP = 220;
/** How far outside the portrait's own circle the drawn ring sits -- the ring is sized to the
 * portrait, not a fixed frame asset, so this is the only "frame size" left to tune. */
const RING_MARGIN = 4;

/** The single ring every speaker shares (docs/research/2026-09-15-ui-revamp.md §3.2/§3.4):
 * a panelLight disc, a 2px border ring, a 1px borderLight inner ring, and a 2px hard shadow
 * below -- replaces the four portrait-frame PNGs and their per-speaker scale fudge factors. */
function drawPortraitRing(g: Phaser.GameObjects.Graphics, portraitSize: number) {
	const r = portraitSize / 2 + RING_MARGIN;
	g.clear();
	g.fillStyle(PALETTE.shadow, 0.45);
	g.fillCircle(0, 2, r);
	g.fillStyle(PALETTE.panelLight, 1);
	g.fillCircle(0, 0, r);
	g.lineStyle(2, PALETTE.border, 1);
	g.strokeCircle(0, 0, r - 1);
	g.lineStyle(1, PALETTE.borderLight, 1);
	g.strokeCircle(0, 0, r - 3);
}

export class DialogueBox {
	private scene: Phaser.Scene;
	private container: Phaser.GameObjects.Container;
	private panel: Phaser.GameObjects.Graphics;
	private namePlate: Phaser.GameObjects.Graphics;
	private nameText: Phaser.GameObjects.BitmapText;
	private bodyText: Phaser.GameObjects.Text;
	private portrait: Phaser.GameObjects.Image;
	private portraitRing: Phaser.GameObjects.Graphics;
	/** Groups the ring and the portrait so a speaker-change pop (see popPortrait) can scale both
	 * together from one place, rather than each needing its own scale/position bookkeeping. */
	private portraitGroup: Phaser.GameObjects.Container;
	private portraitSize = PORTRAIT_SIZE_1X;
	/** The previous line's speaker -- renderCurrent() pops the portrait only when this changes,
	 * not on every page/phase turn within the same speaker's line. */
	private lastSpeaker: string | null = null;
	/** The portrait's idle blink loop (see scheduleBlink/playBlink) -- runs only while a line is
	 * showing, cleared on close(). */
	private blinkTimer: Phaser.Time.TimerEvent | null = null;
	private blinkTween: Phaser.Tweens.Tween | null = null;
	private sequencer: DialogueSequencer | null = null;
	private onCompleteCb: (() => void) | null = null;
	private typeTimer: Phaser.Time.TimerEvent | null = null;
	private fullText = "";
	/** The current line/phase's text, split to fit the panel's vertical space -- advance() pages
	 * through these before moving the sequencer to the next phase/line. */
	private pages: string[] = [];
	private pageIndex = 0;
	private bodyTextTop = 38;
	private bodyTextMaxHeight = 66;
	/** Set in applyPhaseStyle so a live text-size change (layout() re-running outside of
	 * renderCurrent) reapplies the right phase's font size rather than always "plain". */
	private currentPhase: DialoguePhase = "plain";
	/** The "keep going" mark (see showContinueMark) and its bob tween. */
	private continueMark: Phaser.GameObjects.BitmapText;
	private continueMarkTween: Phaser.Tweens.Tween | null = null;
	private continueMarkBaseY = 0;
	private continueMarkStill = false;
	/** An invisible hit-rectangle over the whole panel, screen-pinned like the container, so
	 * TouchControls' "UI owns its gesture" ownership check (isScreenUI) recognises a tap here as
	 * belonging to this panel rather than the world underneath it. TouchControls itself already
	 * advances on any tap while this box is open (see its onPointerDown); this plate does not add
	 * its own pointerdown handler, which would double-advance on the same tap. */
	private tapPlate: Phaser.GameObjects.Rectangle;

	constructor(scene: Phaser.Scene) {
		this.scene = scene;
		this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(10000).setVisible(false);
		this.panel = scene.add.graphics();
		this.namePlate = scene.add.graphics();
		// portrait-*.png is baked with a circular alpha crop already (scripts/circle-crop-
		// portraits.py) -- Phaser 4 dropped GeometryMask support under WebGL (setMask() silently
		// no-ops there, console-warning only; confirmed against a live WebGL render, not just an
		// offline mockup, which is exactly why that mockup didn't catch it), so cropping the art
		// itself is what actually works instead of masking it at runtime.
		this.portrait = scene.add.image(0, 0, "__DEFAULT").setVisible(false);
		this.portraitRing = scene.add.graphics().setVisible(false);
		this.portraitGroup = scene.add.container(0, 0, [this.portraitRing, this.portrait]);
		// A real bitmap font, not Pixelify Sans through canvas Text -- this is exactly the smudged
		// character-confusion bug in speaker labels.
		this.nameText = addPixelText(scene, 0, 0, "", { tint: PALETTE.panelLight }).setOrigin(0, 0.5);
		// Pixelify Sans's blocky glyphs work fine as a short, bold name tag but get hard to parse
		// as full sentences -- Nunito (rounded, high x-height) is what actually gets read here, so
		// it gets a plainer, more legible face plus a bit of line-spacing room to breathe.
		this.bodyText = scene.add.text(0, 0, "", { padding: { x: 2, y: 3 }, resolution: 2, fontFamily: "Nunito, sans-serif", fontSize: "16px", color: PALETTE.css.text, wordWrap: { width: 100 }, lineSpacing: 4 });
		// "press again" mark: appears once the typewriter finishes a page, bobs gently, and is
		// otherwise invisible -- see showContinueMark/hideContinueMark.
		// Fixed at 2x the atlas's native size regardless of the text-size setting -- a small
		// decorative arrow, not body copy that needs to track the accessibility scale.
		this.continueMark = addPixelText(scene, 0, 0, "›", { scale: 2, tint: PALETTE.accentDark }).setOrigin(1, 1).setVisible(false);
		this.tapPlate = scene.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0).setScrollFactor(0, 0).setInteractive();
		this.container.add([this.panel, this.portraitGroup, this.namePlate, this.nameText, this.bodyText, this.continueMark, this.tapPlate]);
		this.layout();
		scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
		// Settings > Text size (SettingsUI.ts) writes through the registry; re-layout live the same
		// way a resize does, rather than waiting for the next line to catch up.
		scene.game.registry.events.on(TEXT_SCALE_CHANGED, this.layout, this);
		scene.events.on(Phaser.Scenes.Events.UPDATE, this.syncContinueMotion);
		scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
			scene.game.registry.events.off(TEXT_SCALE_CHANGED, this.layout, this);
			scene.events.off(Phaser.Scenes.Events.UPDATE, this.syncContinueMotion);
			this.blinkTimer?.remove();
		});
	}

	/** Repositions/resizes the panel from the current viewport AND the current line's content --
	 * called on resize, on a text-size change, and whenever renderCurrent()/advance() puts new
	 * text on screen, since the panel is sized to fit that content rather than a fixed box. */
	private layout = () => {
		// Re-applies the player's text-size setting (Settings > Text size) to the current phase's
		// font sizes -- layout() runs on a resize AND right after that setting changes, so this
		// keeps both in sync without a second code path.
		this.applyPhaseStyle(this.currentPhase);
		this.resizeAndDraw();
	};

	private resizeAndDraw() {
		const wasFullyTyped = this.isFullyTyped();
		// Max width 640, centred, on anything wide enough to want it; phones keep the
		// full-width-minus-margins panel this already was.
		const w = Math.min(this.scene.scale.width * 0.92, MAX_PANEL_WIDTH);
		const narrow = w < NARROW_PANEL_WIDTH;
		this.portraitSize = narrow ? PORTRAIT_SIZE_1X : PORTRAIT_SIZE_2X;

		const textX = 16 + this.portraitSize + 16;
		this.bodyText.setWordWrapWidth(w - textX - 16);

		// Pagination ceiling -- independent of the panel's own (content-sized) final height.
		this.bodyTextMaxHeight = Math.min(this.scene.scale.height * MAX_BODY_TEXT_HEIGHT_FRACTION, MAX_BODY_TEXT_HEIGHT_CAP);
		if (this.sequencer && this.pages.length) {
			// Keep the current page and everything after it when rotating. Old wrapping
			// belongs to the previous viewport; retaining it can overflow the new panel.
			const remaining = this.pages.slice(this.pageIndex).join(" ").replace(/\n/g, " ");
			this.pages = this.buildPages(remaining);
			this.pageIndex = 0;
			this.fullText = this.pages[0];
		}

		// Measure the current page's actual wrapped height (not the pagination ceiling) so the
		// panel is sized to what is really on screen, whichever is smaller.
		this.bodyText.setText(this.fullText);
		const bodyContentH = this.fullText ? this.bodyText.height : 0;
		this.bodyText.setText(wasFullyTyped || !this.sequencer ? this.fullText : "");
		if (this.sequencer && !wasFullyTyped) {
			this.typeTimer?.remove();
			this.typeOut();
		}

		const namePlateH = this.nameText.text ? this.nameText.height + 8 : 0;
		const nameGap = namePlateH ? 6 : 0;
		const textColumnH = namePlateH + nameGap + bodyContentH;
		const portraitBlockH = this.portraitSize + RING_MARGIN * 2;
		const topPad = 14;
		const bottomPad = 20; // room for the continue mark
		const contentH = Math.max(portraitBlockH, textColumnH);
		const h = Math.max(MIN_PANEL_HEIGHT, topPad + contentH + bottomPad);

		const x = (this.scene.scale.width - w) / 2;
		const y = this.scene.scale.height - h - 12;
		this.container.setPosition(x, y);
		this.tapPlate.setSize(w, h).setPosition(0, 0);

		drawPanel(this.panel, w, h, { variant: "cream" });

		const portraitX = 16 + this.portraitSize / 2;
		const portraitY = topPad + contentH / 2;
		this.portrait.setDisplaySize(this.portraitSize, this.portraitSize).setPosition(0, 0);
		this.portraitRing.setPosition(0, 0);
		drawPortraitRing(this.portraitRing, this.portraitSize);
		this.portraitGroup.setPosition(portraitX, portraitY);

		// Name plate: a small walnut pill sized to the name label, sitting above the body text
		// (not the portrait) -- docs/research/2026-09-15-ui-revamp.md §3.4.
		const nameTextTop = topPad;
		this.nameText.setPosition(textX + 10, nameTextTop + namePlateH / 2);
		if (namePlateH) {
			const plateW = this.nameText.width + 20;
			this.namePlate.setVisible(true).setPosition(textX, nameTextTop);
			this.namePlate.clear();
			this.namePlate.fillStyle(PALETTE.panelDark, 1);
			this.namePlate.fillRoundedRect(0, 0, plateW, namePlateH, 4);
		} else {
			this.namePlate.setVisible(false);
		}

		this.bodyTextTop = topPad + namePlateH + nameGap;
		this.bodyText.setPosition(textX, this.bodyTextTop);

		this.continueMarkBaseY = h - 14;
		this.continueMark.setPosition(w - 16, this.continueMarkBaseY);
		// Mid-bob and still meant to be showing (a resize or a settings change, not a fresh page) --
		// restart the tween at the new baseline rather than leaving it bobbing around a stale one.
		if (this.continueMark.visible) this.showContinueMark();
	}

	isActive(): boolean {
		return this.container.visible;
	}

	/** The root object attachGameplay hides from the world/zoomed camera. */
	get gameObject(): Phaser.GameObjects.Container {
		return this.container;
	}

	play(lines: DialogueLine[], onComplete?: () => void) {
		this.sequencer = new DialogueSequencer(lines);
		this.onCompleteCb = onComplete ?? null;
		this.lastSpeaker = null;
		this.container.setVisible(true);
		this.scene.events.emit(DialogueBox.EVENT_OPEN);
		// renderCurrent() (via resizeAndDraw()) positions the container for this line's actual
		// content FIRST, so the spring-open below has the right resting y to slide up into --
		// otherwise the slide would animate toward whatever position the box was left at last time.
		this.renderCurrent();
		// Spring open: slide up from 24px below rest with a small overshoot (2026-09-15 UI revamp
		// phase 4, docs/research/2026-09-15-ui-revamp.md §3.4 item 1).
		openPanel(this.scene, this.container, { scale: 0.92, alpha: 0, y: 24 });
		this.scheduleBlink();
	}

	/** Scene events, so the audio layer (and anything else) can react to dialogue without this
	 * class knowing it exists: OPEN once per play(), LINE per line/phase with (speaker, phase). */
	static readonly EVENT_OPEN = "dialogue:open";
	static readonly EVENT_LINE = "dialogue:line";

	private renderCurrent() {
		const line = this.sequencer?.current();
		if (!line) {
			this.close();
			return;
		}
		const speakerChanged = line.speaker !== this.lastSpeaker;
		this.lastSpeaker = line.speaker;
		this.nameText.setText(line.speaker);
		this.scene.events.emit(DialogueBox.EVENT_LINE, line.speaker, line.phase);
		// Style (font size) affects wrapping, so it must be set before measuring pages.
		this.applyPhaseStyle(line.phase);
		this.pages = this.buildPages(line.text);
		this.pageIndex = 0;
		this.fullText = this.pages[0];
		this.bodyText.setText("");
		if (this.scene.textures.exists(`portrait-${line.speaker.toLowerCase()}`)) {
			this.portrait.setTexture(`portrait-${line.speaker.toLowerCase()}`).setVisible(true);
			this.portraitRing.setVisible(true);
		} else {
			this.portrait.setVisible(false);
			this.portraitRing.setVisible(false);
		}
		// Re-measures and redraws the panel to fit this line's actual content (name + portrait +
		// wrapped body) rather than waiting for the next resize/text-scale event.
		this.resizeAndDraw();
		this.typeOut();
		if (speakerChanged) this.popPortrait();
	}

	/**
	 * Per-phase styling for the translation gag: the untranslated noise line reads small and
	 * muted, the sponsor bumper flashes as a bold one-liner, and the translated English line is
	 * the box's normal readable style. Plain (non-gag) lines use the same normal style.
	 */
	private applyPhaseStyle(phase: DialoguePhase) {
		this.currentPhase = phase;
		const scale = getTextScale(this.scene.game);
		if (phase === "noise") {
			this.bodyText.setFontSize(BODY_FONT_GAG * scale).setColor(PALETTE.css.text).setFontStyle("italic");
		} else if (phase === "bumper") {
			this.bodyText.setFontSize(BODY_FONT_GAG * scale).setColor(PALETTE.css.gagRed).setFontStyle("bold");
		} else if (phase === "thought") {
			this.bodyText.setFontSize(BODY_FONT_GAG * scale).setColor(PALETTE.css.text).setFontStyle("italic");
		} else {
			this.bodyText.setFontSize(BODY_FONT_PLAIN * scale).setColor(PALETTE.css.text).setFontStyle("normal");
		}
		// NAME_FONT (16) is the pixel-font atlas's own native size, so the text-size setting maps
		// straight onto an integer BitmapText scale -- see pixelText.ts.
		this.nameText.setScale(Math.max(1, Math.round(scale)));
	}

	/**
	 * Splits text into pages that each fit bodyTextMaxHeight at the current wrap width/font size.
	 * Measures with the real Text object (not an estimated line-height) so it stays correct across
	 * font size, line spacing, or wrap-width changes without a second place to keep in sync.
	 */
	private buildPages(text: string): string[] {
		const wrapped = this.bodyText.getWrappedText(text);
		if (wrapped.length <= 1) return [text];
		this.bodyText.setText(text);
		const lineHeight = this.bodyText.height / wrapped.length;
		const linesPerPage = Math.max(1, Math.floor(this.bodyTextMaxHeight / lineHeight));
		if (linesPerPage >= wrapped.length) return [text];
		const pages: string[] = [];
		for (let i = 0; i < wrapped.length; i += linesPerPage) {
			// Trim each wrapped line before rejoining -- getWrappedText's own line breaks can fall
			// on a space, so a naive join doubles it up ("all yours,  I promise").
			pages.push(
				wrapped
					.slice(i, i + linesPerPage)
					.map((l) => l.trim())
					.join("\n")
			);
		}
		return pages;
	}

	private typeOut() {
		this.typeTimer?.remove();
		// A fresh page just started typing -- the "keep going" mark belongs to a page that's done.
		this.hideContinueMark();
		let shown = 0;
		// Settings > Text speed (SettingsUI.ts) -- read fresh each page rather than cached, so a
		// mid-conversation change takes effect from the next page onward.
		this.typeTimer = this.scene.time.addEvent({
			delay: charDelayMs(getTextSpeed(this.scene.game)),
			loop: true,
			callback: () => {
				shown += 1;
				this.bodyText.setText(this.fullText.slice(0, shown));
				if (shown >= this.fullText.length) {
					this.typeTimer?.remove();
					this.showContinueMark();
				}
			},
		});
	}

	/** The "press again" mark at the panel's bottom-right: hidden while typing or closed, bobbing
	 * 3px once a page has fully typed out -- the improvement brief's continue affordance. Does not
	 * touch typewriter timing (textSpeed.ts) at all. */
	private showContinueMark() {
		this.continueMarkTween?.remove();
		this.continueMarkTween = null;
		this.continueMark.setPosition(this.continueMark.x, this.continueMarkBaseY).setVisible(true);
		this.continueMarkStill = reducedMotion(this.scene);
		if (this.continueMarkStill) return;
		this.continueMarkTween = this.scene.tweens.add({
			targets: this.continueMark,
			y: this.continueMarkBaseY - 3,
			duration: 420,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
		});
	}

	private syncContinueMotion = () => {
		if (this.continueMark.visible && this.continueMarkStill !== reducedMotion(this.scene)) this.showContinueMark();
	};

	private hideContinueMark() {
		this.continueMarkTween?.remove();
		this.continueMarkTween = null;
		this.continueMark.setVisible(false);
	}

	private isFullyTyped(): boolean {
		return this.bodyText.text.length >= this.fullText.length;
	}

	/** Space/E/tap: fast-forward the current line if still typing, else move to the next phase/line. */
	advance() {
		if (!this.sequencer || !this.container.visible) return;
		if (!this.isFullyTyped()) {
			this.typeTimer?.remove();
			this.bodyText.setText(this.fullText);
			this.showContinueMark();
			return;
		}
		if (this.pageIndex < this.pages.length - 1) {
			this.pageIndex += 1;
			this.fullText = this.pages[this.pageIndex];
			this.bodyText.setText("");
			this.resizeAndDraw();
			this.typeOut();
			return;
		}
		const more = this.sequencer.advance();
		if (!more) {
			this.close();
			return;
		}
		this.renderCurrent();
	}

	private close() {
		this.typeTimer?.remove();
		this.hideContinueMark();
		this.blinkTimer?.remove();
		this.blinkTimer = null;
		this.blinkTween?.remove();
		this.blinkTween = null;
		this.sequencer = null;
		const cb = this.onCompleteCb;
		this.onCompleteCb = null;
		closePanel(this.scene, this.container, () => {
			this.container.setVisible(false).setAlpha(1);
			if (cb) cb();
		});
	}

	/** Schedules the next idle blink -- a 2-frame squash of the portrait's own Y scale (never the
	 * ring, never a rotation) every 3-6s while a line is showing (2026-09-15 UI revamp phase 4).
	 * Re-scheduled from within playBlink() itself rather than a fixed-interval repeating timer, so
	 * each blink's gap is independently randomised. */
	private scheduleBlink() {
		this.blinkTimer?.remove();
		const delay = Phaser.Math.Between(3000, 6000);
		this.blinkTimer = this.scene.time.delayedCall(delay, () => {
			this.playBlink();
			this.scheduleBlink();
		});
	}

	private playBlink() {
		if (!this.portrait.visible) return;
		// Purely decorative -- under reduced motion this simply never plays, rather than snapping
		// to a "blinked" state (there is no state to preserve, unlike a panel open/close).
		if (reducedMotion(this.scene)) return;
		this.blinkTween?.remove();
		const sy = this.portrait.scaleY;
		this.blinkTween = this.scene.tweens.add({
			targets: this.portrait,
			scaleY: sy * 0.92,
			duration: 45,
			yoyo: true,
			ease: "Quad.easeInOut",
			onComplete: () => {
				this.blinkTween = null;
			},
		});
	}

	/** A quick scale pop (0.85 -> 1) on the portrait + ring together, played whenever the speaker
	 * changes (see renderCurrent) -- reinforces "someone new is talking" (2026-09-15 UI revamp
	 * phase 4, mobile-ux research item 2). */
	private popPortrait() {
		this.scene.tweens.killTweensOf(this.portraitGroup);
		if (reducedMotion(this.scene)) {
			this.portraitGroup.setScale(1);
			return;
		}
		this.portraitGroup.setScale(0.85);
		this.scene.tweens.add({ targets: this.portraitGroup, scale: 1, duration: MOTION.duration.badge, ease: "Back.easeOut" });
	}
}
