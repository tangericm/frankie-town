import Phaser from "phaser";
import { layoutHeroBackground, TITLE_ART } from "../systems/titleBackground";
import { PALETTE } from "../systems/palette";
import { addAmbientMotes } from "../systems/ambientMotes";
import { drawEmbossedLogo } from "../systems/titleLogo";
import { getAudio } from "../systems/audio";
import { clearSavedState, hasSavedProgress, hasUnsupportedSave } from "../systems/GameState";
import { makeButton, type ButtonHandle } from "../systems/panel";
import { addPixelText } from "../systems/pixelText";
import { createPigeon } from "../systems/wildlife";
import { FRANKIE_ORIGIN } from "../data/frankieAnim";
import { reducedMotion as prefersReducedMotion } from "../systems/juice";

/**
 * The title: the street painting (see titleBackground.ts) with the logo on the sky, Frankie
 * trotting along the pavement, a pigeon on the road, and the menu as real buttons in the game's
 * own panel material (docs/research/2026-09-15-ui-revamp.md §3.4). Tap anywhere still starts;
 * the buttons are for the choice between continuing and starting over.
 */
export default class Title extends Phaser.Scene {
	constructor() {
		super("Title");
	}

	private confirmingNewGame = false;
	private confirmTimer: Phaser.Time.TimerEvent | null = null;
	private newGameButton: ButtonHandle | null = null;
	private stopLife: (() => void) | null = null;
	private buttons: ButtonHandle[] = [];
	private focused = 0;

	create() {
		this.confirmingNewGame = false;
		this.focused = 0;
		this.layout();
		// Music starts here (on the first tap/keypress that unlocks audio) so the title isn't silent
		// and the apartment's loop is already playing when the player arrives.
		getAudio(this).attach(this);
		this.scale.on(Phaser.Scale.Events.RESIZE, this.relayout, this);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.scale.off(Phaser.Scale.Events.RESIZE, this.relayout, this);
			this.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.layout, this);
			this.stopLife?.();
			this.confirmTimer?.remove();
			this.input.keyboard?.off("keydown", this.onKey, this);
		});

		this.input.keyboard?.on("keydown", this.onKey, this);
		// Tap anywhere starts -- unless the tap landed on a button, which handles itself.
		this.input.on("pointerdown", (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
			if (over.length) return;
			this.start();
		});
	}

	private start() {
		if (hasUnsupportedSave()) { location.reload(); return; }
		this.scene.start("Apartment");
	}

	/** Wiping a save is the only destructive thing in the game, and a gift game passed between
	 * phones needs it visible rather than hidden in a URL parameter -- so it asks once. */
	private newGame() {
		clearSavedState();
		this.game.registry.remove("frankie:gameState");
		this.scene.start("Apartment");
	}

	private relayout = () => {
		// Flush Phaser's input insertion queue before destroying a layout; coalesce one resize frame.
		this.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.layout, this);
		this.events.once(Phaser.Scenes.Events.PRE_UPDATE, this.layout, this);
	};

	private layout() {
		this.stopLife?.();
		this.stopLife = null;
		this.tweens.killAll();
		this.children.getChildren().slice().forEach(child => child.destroy());
		this.buttons = [];
		this.newGameButton = null;
		const w = this.scale.width;
		const h = this.scale.height;
		this.cameras.main.setBackgroundColor(PALETTE.css.shadow);
		const isTouch = Boolean(this.sys.game.device.input.touch);

		const hero = layoutHeroBackground(this, w, h);
		const at = (x: number, y: number) => (hero ? hero.toScreen(x, y) : { x: (x / TITLE_ART.width) * w, y: (y / TITLE_ART.height) * h });
		const s = hero?.scale ?? 1;

		// Flour-dust motes over the building band: the minimum a painted background needs to read
		// as running rather than paused (docs/research/ui-ux-conventions.md §1).
		if (hero) addAmbientMotes(this, w, Math.max(0, hero.top), Math.min(h, hero.bottom));

		this.addLife(at, s, w);

		// Logo on the sky above the rooftops, never wider than the painting itself.
		const logoY = hero?.logoY ?? h * 0.18;
		const embossed = drawEmbossedLogo(this, w / 2, logoY, Math.min(w * 0.8, 360 * s));
		if (embossed && !prefersReducedMotion(this)) {
			const { logo, shadow, highlight, haloLayers } = embossed;
			this.tweens.add({ targets: [logo, shadow, highlight, ...haloLayers], y: "+=4", duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
		} else if (!embossed) {
			addPixelText(this, w / 2, logoY, "Frankie's Adventure", { scale: 2, tint: PALETTE.panelLight, align: 1 }).setOrigin(0.5);
		}

		// Menu on the road. The primary button is the one thing on the screen in the accent.
		const unsupported = hasUnsupportedSave();
		const resuming = hasSavedProgress() || unsupported;
		const buttonW = Math.min(240, w - 48);
		const primaryY = Math.min(h - 96, at(0, TITLE_ART.roadY).y);
		const primary = makeButton(this, w / 2 - buttonW / 2, primaryY - 22, unsupported ? "Reload" : resuming ? "Continue" : "Start", () => this.start(), {
			width: buttonW,
			height: 44,
			variant: "accent",
			fontSize: 16,
			depth: 10,
		});
		this.buttons.push(primary);
		if (resuming) {
			const secondaryY = primaryY + 40;
			this.newGameButton = makeButton(this, w / 2 - buttonW / 2, secondaryY, this.confirmingNewGame ? "Wipe save?" : "New game", () => this.onNewGameTap(), {
				width: buttonW,
				height: 36,
				variant: "walnut",
				fontSize: 14,
				depth: 10,
			});
			this.buttons.push(this.newGameButton);
		}
		this.buttons[this.focused]?.setFocused(!isTouch);
		if (unsupported) {
			addPixelText(this, w / 2, primaryY - 60, "This save needs a newer version.\nReload to continue.", { tint: PALETTE.panelLight, align: 1 })
				.setOrigin(0.5).setDropShadow(1, 1, PALETTE.shadow, 1).setDepth(10);
		}

		// The keyboard is the one control the badges never explain; touch has no such gap.
		const hintY = primaryY + (resuming ? 96 : 52);
		if (!isTouch && hintY < h - 12) {
			addPixelText(this, w / 2, hintY, unsupported ? "Space to reload   Tab to choose\nEnter to select" : "Space to start   WASD / arrows to move   E to interact   click to walk", { tint: PALETTE.panelLight, align: 1 })
				.setOrigin(0.5)
				.setAlpha(0.85)
				.setDropShadow(1, 1, PALETTE.shadow, 1).setDepth(10);
		} else if (isTouch && hintY < h - 12) {
			addPixelText(this, w / 2, hintY, unsupported ? "Tap to reload" : "Tap anywhere to play", { tint: PALETTE.panelLight, align: 1 }).setOrigin(0.5).setAlpha(0.8).setDropShadow(1, 1, PALETTE.shadow, 1).setDepth(10);
		}
	}

	private onKey = (event: KeyboardEvent) => {
		if (event.repeat) return;
		if (!["Space", "Enter", "Tab"].includes(event.code) && !event.code.startsWith("Arrow")) return;
		event.preventDefault();
		event.stopPropagation(); // Phaser may process this same queued event again before the next frame.
		if (event.code === "Space") { this.start(); return; }
		if (event.code === "Tab" || event.code.startsWith("Arrow")) {
			const back = event.shiftKey || event.code === "ArrowLeft" || event.code === "ArrowUp";
			this.focused = (this.focused + (back ? -1 : 1) + this.buttons.length) % this.buttons.length;
			this.buttons.forEach((button, i) => button.setFocused(i === this.focused));
		} else if (event.code === "Enter") {
			this.buttons[this.focused]?.activate();
		}
	};

	private onNewGameTap() {
		if (this.confirmingNewGame) {
			this.newGame();
			return;
		}
		this.confirmingNewGame = true;
		this.newGameButton?.setLabel("Wipe save?");
		this.confirmTimer?.remove();
		this.confirmTimer = this.time.delayedCall(3500, () => {
			this.confirmingNewGame = false;
			this.newGameButton?.setLabel("New game");
		});
	}

	/** Frankie trots along the pavement and stops to look at the bakery; a pigeon potters on the
	 * road. Both live in the painting's own pixel scale. */
	private addLife(at: (x: number, y: number) => { x: number; y: number }, s: number, w: number) {
		const stops: (() => void)[] = [];
		if (this.textures.exists("frankie-walking-east-sheet") && this.textures.exists("frankie-idle-east-sheet")) {
			for (const dir of ["east", "west"]) {
				for (const kind of ["idle", "walking"]) {
					const key = `frankie-${kind}-${dir}`;
					if (!this.anims.exists(key) && this.textures.exists(`${key}-sheet`)) {
						this.anims.create({ key, frames: this.anims.generateFrameNumbers(`${key}-sheet`, {}), frameRate: 9, repeat: -1 });
					}
				}
			}
			const pavement = at(0, TITLE_ART.pavementY).y;
			const startX = at(-40, 0).x;
			const endX = at(TITLE_ART.width + 40, 0).x;
			const frankie = this.add.sprite(startX, pavement, "frankie-walking-east-sheet", 0).setOrigin(...FRANKIE_ORIGIN["walking-east"]).setScale(s).setDepth(5);
			frankie.play("frankie-walking-east");
			const bakeryDoorX = at(105, 0).x;
			let alive = true;
			let pendingTimer: Phaser.Time.TimerEvent | null = null;
			const trot = () => {
				if (!alive) return;
				frankie.setX(startX).setOrigin(...FRANKIE_ORIGIN["walking-east"]).play("frankie-walking-east", true);
				this.tweens.add({
					targets: frankie,
					x: bakeryDoorX,
					duration: ((bakeryDoorX - startX) / (55 * s)) * 1000,
					onComplete: () => {
						if (!alive) return;
						// A sniff at the bakery door, then on down the street.
						if (this.anims.exists("frankie-idle-east")) frankie.setOrigin(...FRANKIE_ORIGIN["idle-east"]).play("frankie-idle-east", true);
						pendingTimer = this.time.delayedCall(2600, () => {
							if (!alive) return;
							frankie.setOrigin(...FRANKIE_ORIGIN["walking-east"]).play("frankie-walking-east", true);
							this.tweens.add({ targets: frankie, x: endX, duration: ((endX - bakeryDoorX) / (55 * s)) * 1000, onComplete: () => { pendingTimer = this.time.delayedCall(2500, trot); } });
						});
					},
				});
			};
			if (prefersReducedMotion(this)) {
				frankie.setX(bakeryDoorX);
				if (this.anims.exists("frankie-idle-east")) frankie.setOrigin(...FRANKIE_ORIGIN["idle-east"]).play("frankie-idle-east", true);
			} else {
				trot();
			}
			stops.push(() => { alive = false; pendingTimer?.remove(); this.tweens.killTweensOf(frankie); });
		}
		if (this.textures.exists("pigeon-idle-sheet") && this.textures.exists("pigeon-walking-sheet") && !prefersReducedMotion(this)) {
			const a = at(40, TITLE_ART.roadY2 - 30);
			const b = at(TITLE_ART.width - 40, TITLE_ART.roadY2 + 30);
			const pigeon = createPigeon(this, { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }, { x: at(300, TITLE_ART.roadY2).x, y: at(0, TITLE_ART.roadY2).y, facing: "west" });
			pigeon.sprite.setScale(s).setDepth(4);
			stops.push(pigeon.stop);
		}
		void w;
		this.stopLife = () => stops.forEach((fn) => fn());
	}
}
