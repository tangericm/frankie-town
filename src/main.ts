import Phaser from "phaser";
import Apartment from "./scenes/Apartment";
import Bakery from "./scenes/Bakery";
import Street from "./scenes/Street";
import Market from "./scenes/Market";
import PaninisFlat from "./scenes/PaninisFlat";
import Preload from "./scenes/Preload";
import Title from "./scenes/Title";
import { installPlaytestTools } from "./systems/playtest";
import { installReadableText } from "./systems/readableText";

class Boot extends Phaser.Scene {
    private loadFailed = false;

    constructor() {
        super("Boot");
    }

    preload() {
        this.loadFailed = false;
        this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => { this.loadFailed = true; });
        this.load.pack("pack", "assets/preload-asset-pack.json");
    }

    create() {

       if (this.loadFailed || !this.cache.json.exists("pack")) { this.game.events.emit("assets:failed"); return; }
	   this.cameras.main.setRoundPixels(true);
	   // Phaser Text draws to a canvas 2D context, which (unlike CSS) does not wait on
	   // font-display. Wait for both font attempts before drawing any body text; a failed webfont
	   // deliberately uses the existing sans-serif fallback rather than rejecting the boot chain.
	   Promise.all(['16px "Pixelify Sans"', '16px "Nunito"'].map(font => document.fonts.load(font).catch(error => {
		   console.warn(`Could not load ${font}; using the system font fallback.`, error);
	   }))).then(() => this.scene.start("Preload"));
    }
}

// A runtime error used to leave a black canvas with no way back. This is DOM, not Phaser, so it
// works when Phaser itself is what broke. Reload keeps the save (localStorage).
function showCrashOverlay(message: string, heading = "Frankie tripped over something.", button = "Tap to reload") {
	// Audio is never worth a reload: a backgrounded tab suspends the AudioContext and coming
	// back can reject a play() or resume() ("AudioContext failed to start" and friends). The
	// audio layer recovers on the next gesture; the game itself is fine.
	if (/audio|sound|webaudio|decod/i.test(message)) {
		console.warn("audio:", message);
		return;
	}
	if (document.getElementById("crash-overlay")) return;
	const el = document.createElement("div");
	el.id = "crash-overlay";
	el.setAttribute("role", "alertdialog");
	el.setAttribute("aria-modal", "true");
	el.setAttribute("aria-label", heading);
	el.innerHTML = `<div class="crash-card"><strong>${heading}</strong><span>${message.replace(/[<>&]/g, "")}</span><button type="button">${button}</button></div>`;
	el.querySelector("button")!.addEventListener("click", () => location.reload());
	document.body.appendChild(el);
	el.querySelector("button")!.focus();
}
window.addEventListener("error", (e) => showCrashOverlay(e.message || "Unknown error"));
window.addEventListener("unhandledrejection", (e) => showCrashOverlay(String((e.reason && e.reason.message) || e.reason || "Unknown error")));

// Installable + offline: the service worker caches the shell and every asset it has served, so a
// home-screen launch works on the train. Production only -- Vite's dev server has its own module
// graph and a cache in front of it hides edits.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
	const wasControlled = Boolean(navigator.serviceWorker.controller);
	navigator.serviceWorker.addEventListener("controllerchange", () => { if (wasControlled) location.reload(); }, { once: true });
	window.addEventListener("load", () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" }).catch(() => {}));
}

window.addEventListener('load', function () {
	const physicsDebug = import.meta.env.DEV
		&& new URLSearchParams(window.location.search).get("physicsDebug") === "1";
	const app = document.getElementById("app")!;
	const container = document.getElementById("game-container")!;
	const vv = window.visualViewport;
	const sizeApp = () => {
		app.style.width = `${vv?.width ?? window.innerWidth}px`;
		app.style.height = `${vv?.height ?? window.innerHeight}px`;
	};
	sizeApp();

	const game = new Phaser.Game({
		width: container.clientWidth,
		height: container.clientHeight,
		backgroundColor: "#2a1a10", // PALETTE.shadow -- one "beyond the world" colour everywhere, matching the rooms' own exterior void
		// The art is 16px tiles and hand-placed pixels; without this the renderer smooths
		// them into mush at any zoom that is not exactly 1.
		pixelArt: true,
		callbacks: { postBoot: installReadableText },
		parent: "game-container",
		physics: {
			default: "arcade",
			arcade: { debug: physicsDebug },
		},
		scale: {
			// A RESIZE canvas is what makes the game portrait on a phone (tall viewport ->
			// tall canvas) and landscape on desktop (wide viewport -> wide canvas) with no
			// forced orientation and no letterboxing -- see the spec's Mobile & responsive
			// design section. Scenes are responsible for re-sizing their own camera and UI
			// on the "resize" event (added in later tasks).
			mode: Phaser.Scale.ScaleModes.RESIZE,
			autoCenter: Phaser.Scale.Center.CENTER_BOTH
		},
		scene: [Boot, Preload, Title, Apartment, Bakery, Street, Market, PaninisFlat]
	});
	game.events.on("assets:failed", () => {
		for (const scene of game.scene.getScenes(true)) {
			scene.input.enabled = false;
			if (scene.input.keyboard) scene.input.keyboard.enabled = false;
		}
		showCrashOverlay("Some game art could not load. Please try again.", "Frankie's still packing.", "Retry loading");
	});

	game.scene.start("Boot");
	if (new URLSearchParams(location.search).get("admin") === "1") installPlaytestTools(game);

	// Dev-only hook so a script (Playwright, browser console) can drive/inspect the live game --
	// e.g. reading Frankie's position or forcing a scene transition -- without gameplay input
	// simulation. Never present in a production build.
	if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;

	// iOS Safari's `window.innerWidth`/`innerHeight` (and CSS `100vh`) are computed against the
	// LARGEST possible viewport, as if the address/tab bar were already collapsed -- not what is
	// actually visible. That leaves the canvas taller than the visible screen, which reads as the
	// game being cropped/zoomed and puts screen-relative UI (the touch joystick, the dialogue box)
	// partly off-screen. `visualViewport` tracks the real visible viewport and fires as Safari's
	// chrome collapses/expands. Size the outer app first; Phaser measures its inset-free child.
	const syncToVisualViewport = () => {
		sizeApp();
		game.scale.setParentSize(container.clientWidth, container.clientHeight);
	};
	window.addEventListener("resize", syncToVisualViewport);
	vv?.addEventListener("resize", syncToVisualViewport);
	syncToVisualViewport();
});
