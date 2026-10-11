import Phaser from "phaser";
import { GameState, getGameState, replaceGameState } from "./GameState";
import { DINNER_CLUES, DINNER_DELIVERY } from "../data/dinner";
import { PROP_THOUGHTS } from "../data/propThoughts";
import { QUEST } from "../data/quest";
import { HEN_IDS, SUGAR_CUBES } from "../data/market.gameplay";

/** Complete the earlier errands; reset only the celebration/hunt inside the test save. */
export function previewState(previous: GameState, checkpoint: "ending" | "dinner"): GameState {
	const data = previous.toJSON();
	data.flags = data.flags.filter(flag => !flag.startsWith("dinner") && !["cakeGiven", "bakeDone"].includes(flag));
	data.counts = Object.fromEntries(Object.entries(data.counts).filter(([key]) => !key.startsWith("dinner")));
	const state = GameState.fromJSON(data);
	state.markIntroSeen();
	state.startErrand();
	for (const id of QUEST.bakeryItemIds) state.collectBakeryItem(id);
	for (const id of ["flour", "eggs", "sugar", "butter"]) { state.revealIngredient(id); state.addIngredient(id); }
	state.markPierreMet(); state.openMarketGate(); state.markMarketMemorySolved();
	for (const id of HEN_IDS) state.homeMarketHen(id);
	for (const cube of SUGAR_CUBES) state.collectMarketSugarCube(cube.id);
	for (const flag of ["paniniMet", "paniniToyTried", "paniniBasketTried", "paniniMoved", "paniniCurtainsOpen", "michellMoved", "touchHintSeen"] as const) state.setFlag(flag);
	if (checkpoint === "dinner") { state.markEndingSeen(); state.setFlag("bakeDone"); state.setFlag("cakeGiven"); }
	return state;
}

type Controls = { zones: () => { id: string }[]; interact: (id: string) => void; advance: () => void };

export function startPreview(scene: Phaser.Scene, checkpoint: "ending" | "dinner") {
	replaceGameState(scene, previewState(getGameState(scene), checkpoint));
	const apartment = scene.game.scene.getScene("Apartment");
	apartment.events.once(Phaser.Scenes.Events.CREATE, () => apartment.time.delayedCall(400, () => {
		(apartment.data.get("playtest:controls") as Controls | undefined)?.interact(checkpoint === "ending" ? "rafa" : "michell");
	}));
	scene.scene.start("Apartment");
}

/** Native, opt-in controls. They never exist in a normal play session. */
export function installPlaytestTools(game: Phaser.Game) {
	const panel = document.createElement("details");
	panel.id = "playtest-tools";
	panel.style.cssText = "position:fixed;bottom:8px;left:8px;z-index:1000;max-width:calc(100vw - 32px);max-height:35vh;overflow:auto;background:#2a1a10;color:#f5e5c5;padding:8px;border:1px solid #d9b27c;border-radius:6px;font:14px system-ui";
	const title = document.createElement("summary"); title.textContent = "Playtest tools · separate save"; panel.append(title);
	const active = () => game.scene.getScenes(true).find(scene => scene.data.get("playtest:controls"));
	const button = (label: string, action: () => void) => {
		const el = document.createElement("button"); el.type = "button"; el.textContent = label;
		el.style.cssText = "min-height:44px;margin:4px"; el.onclick = action; panel.append(el);
	};
	button("Replay ending", () => { const scene = active(); if (scene) startPreview(scene, "ending"); });
	button("Replay hunt", () => { const scene = active(); if (scene) startPreview(scene, "dinner"); });
	button("Collect keepsakes", () => {
		const scene = active(); if (!scene || scene.physics.world.isPaused) return;
		const state = getGameState(scene); if (!state.flag("cakeGiven")) return;
		state.setFlag("dinnerStarted"); for (const clue of DINNER_CLUES) state.setFlag(clue.flag);
		const street = game.scene.getScene("Street") as Phaser.Scene & { faceAndSpawn: (x: number, y: number, facing: "north") => void };
		street.events.once(Phaser.Scenes.Events.CREATE, () => street.time.delayedCall(350, () => street.faceAndSpawn(DINNER_DELIVERY.x + 20, DINNER_DELIVERY.y + 30, "north")));
		scene.scene.start("Street");
	});
	button("Fill notebook", () => { const scene = active(); if (!scene || scene.physics.world.isPaused) return; const state = getGameState(scene); for (const prop of Object.values(PROP_THOUGHTS).flat()) if (!state.count(`propSeen:${prop.id}`)) state.bump(`propSeen:${prop.id}`); });
	const maps = document.createElement("select"); maps.setAttribute("aria-label", "Jump to scene");
	for (const name of ["Apartment", "Street", "Bakery", "Market", "PaninisFlat"]) maps.add(new Option(name, name));
	maps.style.minHeight = "44px"; panel.append(maps);
	button("Go", () => { const scene = active(); if (scene && !scene.physics.world.isPaused) scene.scene.start(maps.value); });
	const zones = document.createElement("select"); zones.setAttribute("aria-label", "Interaction"); zones.style.minHeight = "44px"; panel.append(zones);
	button("Interact", () => { const scene = active(); (scene?.data.get("playtest:controls") as Controls | undefined)?.interact(zones.value); });
	const label = document.createElement("label"), auto = document.createElement("input"); auto.type = "checkbox";
	label.append(auto, " Auto dialogue"); label.style.cssText = "display:inline-block;padding:12px"; panel.append(label);
	let last = "";
	const timer = window.setInterval(() => {
		const scene = active(), controls = scene?.data.get("playtest:controls") as Controls | undefined;
		const ids = controls?.zones().map(zone => zone.id) ?? [], signature = `${scene?.sys.settings.key}:${ids.join()}`;
		if (signature !== last) { const selected = zones.value; zones.replaceChildren(...ids.map(id => new Option(id, id))); if (ids.includes(selected)) zones.value = selected; last = signature; }
		if (auto.checked) controls?.advance();
	}, 250);
	panel.addEventListener("keydown", event => event.stopPropagation());
	document.body.append(panel);
	game.events.once(Phaser.Core.Events.DESTROY, () => { window.clearInterval(timer); panel.remove(); });
}
