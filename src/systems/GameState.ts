import Phaser from "phaser";

type Listener = () => void;

interface MarketProgressSnapshot {
	pierreIntroduced: boolean;
	gateOpened: boolean;
	homedHenIds: string[];
	sugarCubeIds: string[];
	/** The memory booth's three rounds have been solved and its rope dropped. Separate from
	 * sugarCubeIds: the cube behind the rope is collected *after* the puzzle, and recording only the
	 * pickup meant leaving (or reloading) in between threw the whole solve away. */
	memorySolved: boolean;
}

const EMPTY_MARKET_PROGRESS: MarketProgressSnapshot = {
	pierreIntroduced: false,
	gateOpened: false,
	homedHenIds: [],
	sugarCubeIds: [],
	memorySolved: false,
};

/** Bump when a field changes meaning or name; fromJSON switches on it. Absent = pre-versioned. */
export const SAVE_VERSION = 2;

interface GameStateSnapshot {
	version: number;
	introSeen: boolean;
	endingSeen: boolean;
	errandStarted: boolean;
	ingredients: string[];
	bakeryItemsCollected: string[];
	revealedIngredients: string[];
	hidingSpotAssignments: Record<string, string> | null;
	market: MarketProgressSnapshot;
	/** Generic one-way booleans (see flag()) and counters (see count()) -- the home for every
	 * small piece of progress that doesn't deserve a named method pair of its own. */
	flags: string[];
	counts: Record<string, number>;
}

type BackwardCompatibleGameStateSnapshot = Partial<Omit<GameStateSnapshot, "market">> & {
	market?: Partial<MarketProgressSnapshot>;
};

/** Flag ids that exist today. A string union rather than a free string so a typo is a compile
 * error, and so this list is the one place to read what the game remembers. */
export type GameFlag =
	| "michellGreeted"
	| "paniniMet" // Frankie has said hello to Panini (the cupboard guard line); the toys unlock after
	| "paniniToyTried"
	| "paniniBasketTried"
	| "paniniMoved"
	| "paniniCurtainsOpen"
	| "bakeDone" // the timing-bar bake in the apartment has been played through
	| "cakeGiven" // the birthday photo has closed; exploration is available
	| "windowBoxBloomed" // the Street planter reached its flowering stage before the cake
	| "michellMoved" // Michell has left her desk (after the market errands)
	| "dinnerStarted" | "dinnerPlush" | "dinnerBowls" | "dinnerSkyline" | "dinnerNoteDropped" | "dinnerRevealed"
	| "dinnerDecoded" | `dinnerWord:${string}`
	| "touchHintSeen"; // the one-time "tap where to go" toast has been shown

/** Counters for thoughts and progress. Legacy event ids remain readable in old saves. */
export type GameCounter =
	| "paniniRest"
	| "windowBoxWatered"
	| "michellChats"
	| `dinnerHint:${string}`
	| `dinnerLetter:${number}`
	| `propSeen:${string}`
	| `event:${string}`;

/**
 * Quest/inventory state for the whole play session. No Phaser dependency of its own -- see
 * getGameState() below for the one place this touches a live game.
 */
export class GameState {
	private introSeen = false;
	private endingSeen = false;
	private errandStarted = false;
	private ingredients = new Set<string>();
	private bakeryItemsCollected = new Set<string>();
	/** Which ingredient rows the journal is allowed to show at all -- distinct from `ingredients`
	 * (which tracks having actually *obtained* one). An ingredient is revealed once the player has
	 * learned it's needed (e.g. Rafa's opening dialogue for flour), before it's been collected. */
	private revealedIngredients = new Set<string>();
	/** item id -> hiding spot id, computed once per session (not once per scene load) so leaving
	 * and re-entering a scene doesn't reshuffle where an already-half-found errand's items are. */
	private hidingSpotAssignments: Record<string, string> | null = null;
	private pierreIntroduced = EMPTY_MARKET_PROGRESS.pierreIntroduced;
	private marketGateOpened = EMPTY_MARKET_PROGRESS.gateOpened;
	private homedMarketHenIds = new Set<string>(EMPTY_MARKET_PROGRESS.homedHenIds);
	private collectedMarketSugarCubeIds = new Set<string>(EMPTY_MARKET_PROGRESS.sugarCubeIds);
	private marketMemorySolved = EMPTY_MARKET_PROGRESS.memorySolved;
	private flags = new Set<string>();
	private counts = new Map<string, number>();
	private listeners: Listener[] = [];

	private notify() {
		// Iterate a copy: a listener may unsubscribe itself (or another) mid-notify, and mutating
		// the array being walked would silently skip the next listener.
		// Each listener is isolated because these are UI/scene callbacks that outlive nothing in
		// particular -- one throwing (e.g. touching an object its scene already destroyed) must not
		// abort the state change for everyone else. That exact case turned a leaked listener into
		// an unwinnable bakery errand; see attachGameplay.ts's onErrandStart.
		for (const listener of [...this.listeners]) {
			try {
				listener();
			} catch (err) {
				console.error("GameState listener threw; continuing", err);
			}
		}
	}

	onChange(listener: Listener) {
		this.listeners.push(listener);
	}

	offChange(listener: Listener) {
		this.listeners = this.listeners.filter((l) => l !== listener);
	}

	hasSeenIntro(): boolean {
		return this.introSeen;
	}

	markIntroSeen() {
		if (this.introSeen) return;
		this.introSeen = true;
		this.notify();
	}

	/** Whether Frankie has delivered the flour to Rafa and heard the closing exchange -- gates
	 * ENDING_DIALOGUE (played once) vs its short replay line on later Rafa conversations. */
	hasSeenEnding(): boolean {
		return this.endingSeen;
	}

	markEndingSeen() {
		if (this.endingSeen) return;
		this.endingSeen = true;
		this.notify();
	}

	/** Whether Frankie has spoken to Teddy at least once -- gates the bakery fetch items so they
	 * can't be picked up (and their errand checklist row can't appear) before the errand exists. */
	hasStartedErrand(): boolean {
		return this.errandStarted;
	}

	startErrand() {
		if (this.errandStarted) return;
		this.errandStarted = true;
		this.notify();
	}

	hasIngredient(id: string): boolean {
		return this.ingredients.has(id);
	}

	isIngredientRevealed(id: string): boolean {
		return this.revealedIngredients.has(id);
	}

	revealIngredient(id: string) {
		if (this.revealedIngredients.has(id)) return;
		this.revealedIngredients.add(id);
		this.notify();
	}

	/** Shuffles `itemIds` across `spotIds` once and caches the result for the rest of the
	 * session -- callers always pass the same two lists, so the cached assignment is reused on
	 * every subsequent call (e.g. re-entering the scene) rather than reshuffling. Not a `notify()`-
	 * driving state change: this is scene setup randomness, not quest progress the UI reacts to.
	 * A plain Fisher-Yates, not Phaser.Utils.Array.Shuffle -- this class has no Phaser dependency
	 * of its own (see the class doc comment), only the module-level getGameState() helper does. */
	getHidingSpotAssignment(itemIds: string[], spotIds: string[]): Record<string, string> {
		// The cached map is also a *persisted* map: it round-trips through localStorage, so a save
		// can outlive the spot ids it names. When the bakery's spots were renamed, every existing
		// save still pointed at the old ones, the scene's `spotById.get(...)!` handed back
		// undefined, and create() threw -- leaving the player on the loading screen forever, on
		// every reload, with no in-game way to clear the save. Revalidate rather than trust it: a
		// map that doesn't assign every item to a distinct, currently-known spot is stale, and a
		// reshuffle is a far better outcome than a brick.
		const assignments = this.hidingSpotAssignments;
		const assigned = assignments && itemIds.map((id) => assignments[id]);
		const usable = assigned
			&& assigned.every((spot) => spotIds.includes(spot))
			&& new Set(assigned).size === assigned.length;
		if (usable) return assignments;

		const shuffledSpots = [...spotIds];
		for (let i = shuffledSpots.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffledSpots[i], shuffledSpots[j]] = [shuffledSpots[j], shuffledSpots[i]];
		}
		const fresh = Object.fromEntries(itemIds.map((id, i) => [id, shuffledSpots[i]]));
		this.hidingSpotAssignments = fresh;
		return fresh;
	}

	addIngredient(id: string) {
		if (this.ingredients.has(id)) return;
		this.ingredients.add(id);
		this.notify();
	}

	hasBakeryItem(id: string): boolean {
		return this.bakeryItemsCollected.has(id);
	}

	collectBakeryItem(id: string) {
		if (this.bakeryItemsCollected.has(id)) return;
		this.bakeryItemsCollected.add(id);
		this.notify();
	}

	bakeryItemsCollectedCount(): number {
		return this.bakeryItemsCollected.size;
	}

	hasMetPierre(): boolean {
		return this.pierreIntroduced;
	}

	markPierreMet() {
		if (this.pierreIntroduced) return;
		this.pierreIntroduced = true;
		this.notify();
	}

	isMarketGateOpen(): boolean {
		return this.marketGateOpened;
	}

	openMarketGate() {
		if (this.marketGateOpened) return;
		this.marketGateOpened = true;
		this.notify();
	}

	isMarketMemorySolved(): boolean {
		return this.marketMemorySolved;
	}

	markMarketMemorySolved() {
		if (this.marketMemorySolved) return;
		this.marketMemorySolved = true;
		this.notify();
	}

	isMarketHenHomed(id: string): boolean {
		return this.homedMarketHenIds.has(id);
	}

	homeMarketHen(id: string) {
		if (this.homedMarketHenIds.has(id)) return;
		this.homedMarketHenIds.add(id);
		this.notify();
	}

	marketHensHomedCount(): number {
		return this.homedMarketHenIds.size;
	}

	hasMarketSugarCube(id: string): boolean {
		return this.collectedMarketSugarCubeIds.has(id);
	}

	collectMarketSugarCube(id: string) {
		if (this.collectedMarketSugarCubeIds.has(id)) return;
		this.collectedMarketSugarCubeIds.add(id);
		this.notify();
	}

	marketSugarCubeCount(): number {
		return this.collectedMarketSugarCubeIds.size;
	}

	flag(id: GameFlag): boolean {
		return this.flags.has(id);
	}

	/** One-way: flags are set, never cleared, like every other piece of progress here. */
	setFlag(id: GameFlag) {
		if (this.flags.has(id)) return;
		this.flags.add(id);
		this.notify();
	}

	count(id: GameCounter): number {
		return this.counts.get(id) ?? 0;
	}

	/** Every counter id with the given prefix and a value above zero (e.g. "propSeen:"). */
	countKeys(prefix: string): string[] {
		return [...this.counts.entries()].filter(([k, n]) => k.startsWith(prefix) && n > 0).map(([k]) => k);
	}

	bump(id: GameCounter, by = 1): number {
		const next = this.count(id) + by;
		this.counts.set(id, next);
		this.notify();
		return next;
	}

	/** Plain-data snapshot for persistence -- Sets aren't JSON-serializable directly. */
	toJSON(): GameStateSnapshot {
		return {
			version: SAVE_VERSION,
			introSeen: this.introSeen,
			endingSeen: this.endingSeen,
			errandStarted: this.errandStarted,
			ingredients: [...this.ingredients],
			bakeryItemsCollected: [...this.bakeryItemsCollected],
			revealedIngredients: [...this.revealedIngredients],
			hidingSpotAssignments: this.hidingSpotAssignments,
			market: {
				pierreIntroduced: this.pierreIntroduced,
				gateOpened: this.marketGateOpened,
				homedHenIds: [...this.homedMarketHenIds],
				sugarCubeIds: [...this.collectedMarketSugarCubeIds],
				memorySolved: this.marketMemorySolved,
			},
			flags: [...this.flags],
			counts: Object.fromEntries(this.counts),
		};
	}

	/** Rehydrates a GameState from a previous toJSON() snapshot, without notify()-ing for each
	 * field -- this is load, not player-driven progress, so nothing should react to it as a change. */
	static fromJSON(data: BackwardCompatibleGameStateSnapshot): GameState {
		const state = new GameState();
		if (!data || typeof data !== "object" || (typeof data.version === "number" && data.version > SAVE_VERSION)) return state;
		const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter(v => typeof v === "string") : [];
		state.introSeen = data.introSeen === true;
		state.endingSeen = data.endingSeen === true;
		state.errandStarted = data.errandStarted === true;
		state.ingredients = new Set(strings(data.ingredients));
		state.bakeryItemsCollected = new Set(strings(data.bakeryItemsCollected));
		state.revealedIngredients = new Set(strings(data.revealedIngredients));
		state.hidingSpotAssignments = data.hidingSpotAssignments && typeof data.hidingSpotAssignments === "object" ? data.hidingSpotAssignments : null;

		const market = data.market ?? EMPTY_MARKET_PROGRESS;
		state.pierreIntroduced = market.pierreIntroduced === true;
		state.marketGateOpened = market.gateOpened === true;
		state.homedMarketHenIds = new Set(strings(market.homedHenIds));
		state.collectedMarketSugarCubeIds = new Set(
			strings(market.sugarCubeIds),
		);
		// A save written before this flag existed still knows the puzzle was solved if the cube
		// behind the rope was collected -- that pickup is only reachable through the solve.
		state.marketMemorySolved = market.memorySolved === true || state.collectedMarketSugarCubeIds.has("lane2");
		state.flags = new Set(strings(data.flags));
		// Version 1's Apartment inspections were not collected keepsakes. Keep the cake and
		// neighbourhood progress, but let those players receive the new scavenger errand.
		if ((data.version ?? 0) < 2) for (const flag of ["dinnerStarted", "dinnerPlush", "dinnerBowls", "dinnerSkyline", "dinnerNoteDropped", "dinnerRevealed"]) state.flags.delete(flag);
		state.counts = new Map(Object.entries(data.counts && typeof data.counts === "object" ? data.counts : {}).filter(([, n]) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0));
		return state;
	}
}

const REGISTRY_KEY = "frankie:gameState";
// Replay links/admin use their own save. Opening a shortcut never overwrites the real game.
const SAVE_PARAMS = typeof location === "undefined" ? null : new URLSearchParams(location.search);
const SAVE_KEY = SAVE_PARAMS?.get("playtest") === "1" || SAVE_PARAMS?.get("admin") === "1" || ["ending", "dinner"].includes(SAVE_PARAMS?.get("preview") ?? "") ? "frankie:playtest" : "frankie:save";

/** Best-effort localStorage read -- private browsing / storage-disabled throws on access, not just
 * on write, and a corrupt or outdated save shape must not crash the game, just start fresh. */
function loadSavedState(): GameState | null {
	try {
		const raw = localStorage.getItem(SAVE_KEY);
		return raw ? GameState.fromJSON(JSON.parse(raw)) : null;
	} catch {
		return null;
	}
}

function persist(state: GameState) {
	try {
		// A stale client may read a newer save, but only an explicit reset may replace it.
		if (hasUnsupportedSave()) return;
		localStorage.setItem(SAVE_KEY, JSON.stringify(state.toJSON()));
	} catch {
		// Quota exceeded / storage disabled -- progress just won't survive a refresh this session.
	}
}

/** Gets or creates the single GameState for this game instance, stored on its registry. Restores
 * from localStorage on first creation and re-saves on every subsequent change, so a refresh resumes
 * the same quest/inventory progress instead of replaying the intro from scratch. */
export function getGameState(scene: Phaser.Scene): GameState {
	let state = scene.game.registry.get(REGISTRY_KEY) as GameState | undefined;
	if (!state) {
		const fresh = loadSavedState() ?? new GameState();
		fresh.onChange(() => persist(fresh));
		scene.game.registry.set(REGISTRY_KEY, fresh);
		state = fresh;
	}
	return state;
}

/** Used by opt-in replay checkpoints before a scene is recreated. */
export function replaceGameState(scene: Phaser.Scene, state: GameState) {
	state.onChange(() => persist(state));
	scene.game.registry.set(REGISTRY_KEY, state);
	persist(state);
}

/** Whether a save with real progress exists -- the title's Continue/New game split hangs on it. */
export function hasSavedProgress(): boolean {
	try {
		if (hasUnsupportedSave()) return false;
		const raw = localStorage.getItem(SAVE_KEY);
		if (!raw) return false;
		const data = JSON.parse(raw) as { introSeen?: boolean } | null;
		return Boolean(data && data.introSeen);
	} catch {
		return false;
	}
}

/** Title offers Reload for newer saves rather than silently replacing their progress. */
export function hasUnsupportedSave(): boolean {
	try {
		const raw = localStorage.getItem(SAVE_KEY);
		const data = raw ? JSON.parse(raw) : null;
		return Boolean(data && typeof data.version === "number" && data.version > SAVE_VERSION);
	} catch {
		return false;
	}
}

/** Reset both the persisted snapshot and an existing session, including notebook counters. */
export function clearSavedState(scene?: Phaser.Scene) {
	scene?.game.registry.remove(REGISTRY_KEY);
	try {
		localStorage.removeItem(SAVE_KEY);
	} catch {
		// Storage disabled -- nothing was persisted in the first place, nothing to clear.
	}
}
