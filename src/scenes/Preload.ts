import Phaser from "phaser";
import { layoutHeroBackground } from "../systems/titleBackground";
import { addAmbientMotes } from "../systems/ambientMotes";
import { PALETTE } from "../systems/palette";
import { drawEmbossedLogo } from "../systems/titleLogo";
import { clearSavedState } from "../systems/GameState";
import { addPixelText } from "../systems/pixelText";
import { startPreview } from "../systems/playtest";

/**
 * Uses the title art (already loaded by Boot's preload-asset-pack.json, ahead of everything
 * else) so this screen blends into Title instead of the previous plain gray bar on flat black --
 * that flat cut used to read as "did this hang?" before Title suddenly appeared.
 */
const PAW_COUNT = 6;
const PAW_SCALE = 0.6;

export default class Preload extends Phaser.Scene {
	private paws: Phaser.GameObjects.Image[] = [];
	private pawsLit = 0;
	private barX = 0;
	private barY = 0;
	private barWidth = 0;
	private progress = 0;
	private loadFailed = false;

	constructor() {
		super("Preload");
	}

	preload() {
		this.progress = 0;
		this.loadFailed = false;
		this.layout();
		this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this));

		this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => { this.loadFailed = true; });
		this.load.pack("asset-pack", "assets/asset-pack.json");
		this.load.on("progress", (value: number) => {
			this.progress = value;
			this.drawProgress();
		});
	}

	private layout = () => {
		this.tweens.killAll();
		this.children.getChildren().slice().forEach(child => child.destroy());
		const w = this.scale.width;
		const h = this.scale.height;
		this.cameras.main.setBackgroundColor(PALETTE.css.shadow);

		const hero = layoutHeroBackground(this, w, h);
		if (hero) addAmbientMotes(this, w, hero.top, hero.bottom);
		// Same anchor, max-width, and pseudo-emboss treatment as Title.layout() -- this used to
		// draw a flat, untreated "title-logo" while Title embossed the same texture, so the logo
		// visibly "un-flattened" the instant Preload handed off to Title. Matching them exactly
		// makes that handoff invisible.
		drawEmbossedLogo(this, w / 2, hero?.logoY ?? 60, Math.min(w * 0.8, hero ? 360 * hero.scale : w));

		this.barWidth = Math.min(w * 0.6, 280);
		this.barX = w / 2 - this.barWidth / 2;
		const bottomEdge = hero?.bottom ?? h;
		this.barY = Math.min(h - 40, bottomEdge + (h - bottomEdge) / 2);

		// A real bitmap font, not Pixelify Sans through canvas Text -- the loading screen is the
		// very first thing drawn, so it gets the same crisp rendering as the rest of the
		// 2026-09-15 UI revamp (docs/research/2026-09-15-ui-revamp.md §3.3).
		addPixelText(this, w / 2, this.barY - 32, "Loading...", { tint: PALETTE.panelLight, align: 1 }).setOrigin(0.5);

		// A trail of paw prints instead of a filled bar -- lights up one at a time as loading
		// progresses, alternating a slight up/down offset like an actual walking trail. Scaled
		// down from the icon's native 32px and given a wider gap from "Loading..." above -- at
		// full size the trail's own vertical spread clipped into the text's descenders.
		this.paws = [];
		this.pawsLit = -1;
		for (let i = 0; i < PAW_COUNT; i++) {
			const px = this.barX + (this.barWidth / (PAW_COUNT - 1)) * i;
			const py = this.barY + (i % 2 === 0 ? 4 : -4);
			const paw = this.add.image(px, py, "icon-pawprint").setScale(PAW_SCALE).setTint(0x8a7355).setAlpha(0.35);
			this.paws.push(paw);
		}
		this.drawProgress();
	};

	private drawProgress() {
		const lit = Math.min(PAW_COUNT, Math.floor(this.progress * PAW_COUNT + 0.001));
		if (lit === this.pawsLit) return;
		const wasComplete = this.pawsLit === PAW_COUNT;
		this.pawsLit = lit;
		this.paws.forEach((paw, i) => {
			if (i >= lit) return;
			paw.clearTint().setAlpha(1);
			this.tweens.add({ targets: paw, scale: { from: PAW_SCALE * 1.6, to: PAW_SCALE }, duration: 220, ease: "Back.easeOut" });
		});
		// A diegetic "we're done" beat instead of the trail just stopping (research §2) -- the
		// last paw gets a bigger bounce plus a quick sparkle burst, like a bakery timer's ding.
		if (lit === PAW_COUNT && !wasComplete) this.celebrateComplete();
	}

	private celebrateComplete() {
		const last = this.paws[this.paws.length - 1];
		if (!last) return;
		this.tweens.add({ targets: last, scale: { from: PAW_SCALE, to: PAW_SCALE * 1.5 }, duration: 160, yoyo: true, ease: "Back.easeOut" });
		const burst = this.add.particles(last.x, last.y, "icon-pawprint", {
			lifespan: 400,
			speed: { min: 40, max: 90 },
			scale: { start: 0.35, end: 0 },
			tint: PALETTE.accent,
			quantity: 6,
			emitting: false,
		});
		burst.explode(6);
		this.time.delayedCall(500, () => burst.destroy());
	}

	create() {
		if (this.loadFailed || !this.cache.json.exists("asset-pack")) { this.game.events.emit("assets:failed"); return; }
		const preview = new URLSearchParams(location.search).get("preview");
		if (preview === "ending" || preview === "dinner") {
			// Consume the checkpoint once: refresh continues the isolated replay save.
			const url = new URL(location.href);
			url.searchParams.delete("preview");
			url.searchParams.set("playtest", "1");
			history.replaceState(null, "", url);
			startPreview(this, preview);
			return;
		}
		// Not gated to development -- wiping your own save from a URL param is safe in any build
		// (it can only ever affect the browser that opened the link) and "start over" is a real,
		// ongoing need on a deployed build too, not just local testing.
		if (new URLSearchParams(location.search).get("reset") === "1") {
			clearSavedState(this);
			console.log("Save cleared -- starting fresh.");
		}
		const params = new URLSearchParams(location.search);
		if (params.get("playtest") === "1" || params.get("admin") === "1") {
			const start = params.get("start");
			this.scene.start(start && ["Apartment", "Street", "Bakery", "Market", "PaninisFlat"].includes(start) ? start : "Apartment");
			return;
		}

		if (process.env.NODE_ENV === "development") {
			const start = new URLSearchParams(location.search).get("start");
			if (start) {
				console.log(`Development: jump to ${start}`);
				this.scene.start(start);
				return;
			}
		}

		this.scene.start("Title");
	}
}
