import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import tsCompiler from "typescript";

// The two mobile-only fixes that have no desktop equivalent to catch them: the touch stick's
// lifetime across a room change, and the journal panel collapsing on a phone-width canvas.

function load(file, requireStub) {
	const js = tsCompiler.transpileModule(readFileSync(file, "utf8"), {
		compilerOptions: { module: tsCompiler.ModuleKind.CommonJS, target: tsCompiler.ScriptTarget.ES2020 },
	}).outputText;
	const moduleObj = { exports: {} };
	runInNewContext(js, { module: moduleObj, exports: moduleObj.exports, require: requireStub });
	return moduleObj.exports;
}

const movement = load("src/systems/playerMovement.ts", () => ({}));
const phaserStub = { Core: { Events: { BLUR: "blur", HIDDEN: "hidden" } }, Scenes: { Events: { SHUTDOWN: "shutdown" } }, Scale: { Events: { RESIZE: "resize" } } };
const touchControlsModule = load("src/systems/TouchControls.ts", (id) => {
	if (id === "./playerMovement") return movement;
	if (id === "./uiInput") return load("src/systems/uiInput.ts", () => ({}));
	if (id.includes("phaser")) return { __esModule: true, default: phaserStub, ...phaserStub };
	return {};
});
const { TouchControls, getJoystickSide, setJoystickSide, nextJoystickSide, joystickSideLabel } = touchControlsModule;

/** A scene stubbed down to what TouchControls' constructor actually touches. `width` backs the
 * joystick-side setting's half-screen gate; `registry` is a minimal Phaser DataManager stand-in
 * (get/set only -- nothing here exercises the changedata events SettingsUI/JournalUI use). */
function fakeScene({ pointer, width = 400 } = {}) {
	const shutdownHandlers = [];
	const resizeHandlers = [];
	const positioned = [];
	const gameEvents = new EventEmitter();
	const handlers = new Map();
	const events = {
		on(name, fn, ctx) { const bound = handlers.get(fn) ?? fn.bind(ctx); handlers.set(fn, bound); gameEvents.on(name, bound); },
		off(name, fn) { gameEvents.off(name, handlers.get(fn)); },
		emit: name => gameEvents.emit(name),
		listenerCount: name => gameEvents.listenerCount(name),
	};
	const chainable = new Proxy({}, {
		get: (_, key) => {
			if (key === "then") return undefined;
			return (...args) => {
				if (key === "setPosition") positioned.push(args);
				return chainable;
			};
		},
	});
	const store = new Map();
	const registry = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) };
	return {
		add: { circle: () => chainable },
		game: { events, registry },
		data: registry,
		sys: { game: { device: { input: { touch: false } } } },
		input: { on() {}, activePointer: pointer ?? { x: 0, y: 0, id: 1 } },
		physics: { world: { isPaused: false } },
		scale: {
			width,
			on(name, fn, ctx) {
				if (name === "resize") resizeHandlers.push(fn.bind(ctx));
			},
			off() {},
		},
		events: {
			once(name, fn) {
				if (name === "shutdown") shutdownHandlers.push(fn);
			},
		},
		positioned,
		resize: () => resizeHandlers.forEach((fn) => fn()),
		shutdown: () => shutdownHandlers.forEach((fn) => fn()),
	};
}
const dialogueStub = { isActive: () => false, advance() {} };

// A cutscene rejects new drags, while tapping an active dialogue still advances it.
{
	const scene = fakeScene(); scene.physics.world.isPaused = true;
	const controls = new TouchControls(scene, dialogueStub);
	controls.onPointerDown({ x: 50, y: 60, id: 1 }, []);
	assert.equal(controls.active, false);
	assert.equal(scene.__touchVector, null);
	let advanced = 0;
	new TouchControls(scene, { isActive: () => true, advance: () => advanced++ }).onPointerDown({ x: 50, y: 60, id: 1 }, []);
	assert.equal(advanced, 1, "dialogue taps remain available during its physics pause");
	scene.data.set("hud:modal", true);
	new TouchControls(scene, { isActive: () => true, advance: () => advanced++ }).onPointerDown({ x: 50, y: 60, id: 1 }, []);
	assert.equal(advanced, 1, "a menu owns taps even with a dialogue behind it");
}

// Break caught (game-breaking, mobile only): Phaser reuses scene *instances* across scene.start(),
// so the stick vector parked on the scene by TouchControls outlived the scene that wrote it.
// Holding forward through the market arch left a non-zero vector behind; on the next visit
// readMoveVector handed it straight back and Frankie walked himself back through the door he had
// just come out of, looping Street <-> Market forever with no input and no way to break out.
const arriving = fakeScene();
movement.setTouchVector(arriving, { x: 0, y: -1 });
new TouchControls(arriving, dialogueStub);
assert.equal(arriving.__touchVector, null, "creating the controls must clear any vector the previous visit left behind");

const leaving = fakeScene();
new TouchControls(leaving, dialogueStub);
movement.setTouchVector(leaving, { x: 0, y: -1 });
leaving.shutdown();
assert.equal(leaving.__touchVector, null, "a scene shutdown must clear the stick, even mid-drag");

// Losing browser focus cancels the gesture, and room shutdown removes global listeners.
for (const event of ["blur", "hidden"]) {
	const scene = fakeScene();
	const controls = new TouchControls(scene, dialogueStub);
	controls.onPointerDown({ x: 50, y: 60, id: 1 }, []);
	movement.setTouchVector(scene, { x: 1, y: 0 });
	scene.game.events.emit(event);
	assert.equal(scene.__touchVector, null, event + " clears movement");
	assert.equal(controls.active, false, event + " ends the gesture");
	scene.shutdown();
	assert.equal(scene.game.events.listenerCount("blur"), 0);
	assert.equal(scene.game.events.listenerCount("hidden"), 0);
}

// And the vector really is what drives movement, so a stale one really would walk him off.
const noKey = { isDown: false };
const cursors = { left: noKey, right: noKey, up: noKey, down: noKey };
const wasd = { A: noKey, D: noKey, W: noKey, S: noKey };
assert.deepEqual(
	Object.assign({}, movement.readMoveVector(leaving, cursors, wasd)),
	{ x: 0, y: 0 },
	"with no input and a cleared stick, the movement vector must be zero",
);
movement.setTouchVector(leaving, { x: 0, y: -1 });
assert.equal(movement.readMoveVector(leaving, cursors, wasd).y, -1, "a live stick must still drive movement");

// Break caught (mobile): the stick's origin is stored in screen space and nothing invalidated it,
// so a viewport resize under a held thumb -- rotating the phone, or far more commonly the URL bar
// collapsing mid-drag -- could leave the origin off the new canvas. Every reachable point was then
// on one side of it, so the stick could only produce one heading, and it rendered out of view while
// doing it. A resize must re-centre the origin on the finger and zero the vector.
{
	const scene = fakeScene({ pointer: { x: 120, y: 140, id: 1 } });
	const controls = new TouchControls(scene, dialogueStub);
	// Simulate a live drag: the joystick is active with its origin where the thumb went down.
	const internals = controls;
	internals.active = true;
	internals.pointerId = 1;
	internals.origin = { x: 100, y: 700 };
	movement.setTouchVector(scene, { x: 0, y: -1 });
	scene.resize();
	// Field-by-field, not deepEqual: the module runs in its own vm realm, so its object literals do
	// not share this realm's Object.prototype and deepStrictEqual rejects them on identity alone.
	assert.equal(internals.origin.x, 120, "a resize must move the stick's origin to where the finger actually is");
	assert.equal(internals.origin.y, 140);
	assert.equal(scene.__touchVector, null, "a resize must zero the heading rather than carry the old one across");
	assert.ok(
		scene.positioned.some(([x, y]) => x === 120 && y === 140),
		"the stick's own graphics must move to the new origin, not stay off-canvas",
	);
}

// --- Journal panel ------------------------------------------------------------------------------
//
// Break caught: on a 390px-wide phone the expanded checklist sits exactly where the market's third
// lane draws its sugar cube -- the panel hid the thing you had walked the whole lane to pick up.
const journal = readFileSync("src/systems/JournalUI.ts", "utf8");
const threshold = Number(journal.match(/COLLAPSE_BELOW_WIDTH = (\d+)/)[1]);
assert.ok(threshold >= 390 && threshold <= 900, "the collapse threshold must separate phone widths from desktop ones");
assert.match(
	journal,
	/this\.collapsed = remembered \?\? \(scene\.scale\.width < COLLAPSE_BELOW_WIDTH \|\| scene\.scale\.height < COLLAPSE_BELOW_HEIGHT\)/,
	"the journal must start collapsed on a phone-sized canvas, and otherwise honour the remembered state",
);
// Break caught: the test was width-only, so a phone in landscape (844x390) counted as a desktop and
// got the full panel over a viewport showing less world than portrait does.
{
	const height = Number(journal.match(/COLLAPSE_BELOW_HEIGHT = (\d+)/)[1]);
	assert.ok(height > 390 && height < 720, "the height threshold must separate a landscape phone from a desktop window");
}
assert.match(
	journal,
	/registry\.set\(COLLAPSED_KEY, collapsed\)/,
	"the collapsed state must live in the game registry -- this UI is rebuilt on every room change",
);
// Break caught: attachGameplay snapshots the UI camera's object list exactly once, so anything
// built after that renders on the world camera too (a tab stuck to the map, scrolling with it).
const tabBuild = journal.indexOf("this.buildTab()");
assert.ok(tabBuild > 0 && tabBuild < journal.indexOf("private visibleRows"), "the tab must be built in the constructor, not lazily in layout()");
assert.match(
	journal,
	/get gameObjects\(\)[\s\S]{0,200}?\[this\.container, \.\.\.\(this\.tab \? \[this\.tab\] : \[\]\), \.\.\.\(this\.pill \? \[this\.pill\] : \[\]\), this\.clip\]/,
	"gameObjects must include the tab and the objective pill -- both live outside the panel container so they survive the panel being hidden",
);
assert.match(
	readFileSync("src/systems/attachGameplay.ts", "utf8"),
	/uiObjects[^=]*= \[dialogueBox\.gameObject, \.\.\.journal\.gameObjects/,
	"attachGameplay must hide every journal object from the world camera, tab included",
);

console.log("mobile-ui.test.mjs: all assertions passed");

// Break caught (mobile): "is anything interactive under the thumb" was the whole test for whether
// to start the joystick, and it is the wrong question. An interactable Frankie cannot reach runs a
// pointerdown handler that correctly does nothing, and the touch was swallowed anyway -- so the
// stick simply did not appear over a distant NPC, or over a sprite whose zone had been removed but
// which is still standing there. The market gate is the one that got reported: 128px square, still
// input-enabled after it has been opened, sitting exactly where the game then asks you to chase
// three hens around. Only a zone that is genuinely in range gets to keep the touch now, and
// screen-pinned UI always keeps its own.
{
	const inRangeZoneTarget = { scrollFactorX: 1 };
	const outOfRangeZoneTarget = { scrollFactorX: 1 };
	const uiPlate = { scrollFactorX: 0 };
	let consumed = 0;
	const interactions = { ownsTouch: (objects) => objects.includes(inRangeZoneTarget), consumePointer: () => consumed++ };

	const start = (over, withManager = true) => {
		const scene = fakeScene({ pointer: { x: 50, y: 60, id: 7 } });
		const controls = new TouchControls(scene, dialogueStub, withManager ? interactions : undefined);
		controls.onPointerDown({ x: 50, y: 60, id: 7 }, over);
		return controls.active;
	};

	assert.equal(start([]), true, "open floor must always start the stick");
	assert.equal(start([outOfRangeZoneTarget]), true, "an interactable Frankie cannot reach must not eat the touch");
	assert.equal(start([inRangeZoneTarget]), true, "a character must allow a drag; only a short release interacts");
	assert.equal(start([{ scrollFactorX: 1, parentContainer: uiPlate }]), false, "nested UI owns its touch");
	assert.equal(start([uiPlate]), false, "screen-pinned UI (journal tab, settings panel) owns its own touches");
	assert.equal(start([uiPlate, outOfRangeZoneTarget]), false, "UI wins even when a world object is under it too");
	assert.equal(consumed, 3, "each UI-owned gesture also consumes its later release");
	// Without a manager (the constructor's optional argument), fall back to the old conservative
	// rule rather than starting a stick under every interactable in the game.
	assert.equal(start([outOfRangeZoneTarget], false), true, "with no InteractionManager, any interactable still blocks");
}

console.log("mobile-ui.test.mjs: touch-ownership assertions passed");

// The player's own zoom setting (item 6): a multiplier on whichever automatic step this viewport
// gets, not an absolute zoom, so "give me a wider view" means the same thing on a phone and on a
// laptop. Two things have to hold: the narrow-viewport decision must be made on the automatic zoom
// (otherwise adjusting zoom could flip the room between 1.6 and 1.1 mid-press), and a player who
// never opens settings must get exactly what they got before this existed.
{
	const registry = new Map();
	const cameraFit = load("src/systems/cameraFit.ts", (id) => (id.includes("phaser") ? { __esModule: true, default: {}, } : {}));
	const { ROOM_ZOOM, NARROW_ZOOM, MIN_VISIBLE_WIDTH, ZOOM_SCALES, DEFAULT_ZOOM_SCALE, roomZoom, setZoomScale } = cameraFit;

	const game = { registry: { get: (k) => registry.get(k), set: (k, v) => registry.set(k, v) } };
	const cam = (width) => ({ width, scene: { game } });
	const wide = cam(Math.ceil(MIN_VISIBLE_WIDTH * ROOM_ZOOM) + 10);
	const narrow = cam(390);

	assert.ok(ZOOM_SCALES.includes(DEFAULT_ZOOM_SCALE), "the default has to be one of the offered steps");
	assert.equal(ZOOM_SCALES[0] < 1 && ZOOM_SCALES[ZOOM_SCALES.length - 1] > 1, true, "the range must go both wider and closer than the default");

	assert.equal(roomZoom(wide), ROOM_ZOOM, "an untouched setting must leave the desktop zoom exactly as it was");
	assert.equal(roomZoom(narrow), NARROW_ZOOM, "...and the narrow-viewport step exactly as it was");

	// setZoomScale writes through to localStorage, which does not exist in this vm realm; the
	// registry half is the part under test and the write is already wrapped in its own try/catch.
	for (const scale of ZOOM_SCALES) {
		setZoomScale(game, scale);
		assert.ok(Math.abs(roomZoom(wide) - ROOM_ZOOM * scale) < 1e-9, `zoom ${scale} must scale the desktop step`);
		assert.ok(Math.abs(roomZoom(narrow) - NARROW_ZOOM * scale) < 1e-9, `zoom ${scale} must scale the narrow step`);
		// The step choice itself must not move: a scaled-up narrow viewport is still a narrow one.
		assert.ok(roomZoom(narrow) < roomZoom(wide), "the narrow viewport must stay on the narrow step at every zoom setting");
	}
}

console.log("mobile-ui.test.mjs: zoom-setting assertions passed");

// Settings > Joystick side (2026-09-14 UI-UX audit, item 5): "Both" (the true default, i.e. every
// existing player's unchanged behaviour) never gates a drag-start; "Left"/"Right" gate it to that
// half of the screen, but a tap must still work on the other half (TapMove/interactions own that).
{
	const screenWidth = 400;
	const leftPointer = { x: 50, y: 60, id: 3 };
	const rightPointer = { x: 350, y: 60, id: 3 };

	const dragStarts = (side, pointer) => {
		const scene = fakeScene({ pointer, width: screenWidth });
		if (side !== null) setJoystickSide(scene.game, side);
		const controls = new TouchControls(scene, dialogueStub);
		controls.onPointerDown(pointer, []);
		controls.onPointerMove({ ...pointer, x: pointer.x + DEADZONE_CLEARING_DX, y: pointer.y });
		return controls.dragging;
	};
	const DEADZONE_CLEARING_DX = 20;

	assert.equal(dragStarts(null, leftPointer), true, "the default (\"Both\") must start a drag from the left half");
	assert.equal(dragStarts(null, rightPointer), true, "...and from the right half, unchanged from before this setting existed");
	assert.equal(dragStarts("left", leftPointer), true, "\"Left\" must still allow a drag-start on the left half");
	assert.equal(dragStarts("left", rightPointer), false, "\"Left\" must refuse a drag-start on the right half");
	assert.equal(dragStarts("right", rightPointer), true, "\"Right\" must still allow a drag-start on the right half");
	assert.equal(dragStarts("right", leftPointer), false, "\"Right\" must refuse a drag-start on the left half");

	// A refused half must still let a short tap through -- only the drag/vector is gated.
	{
		const scene = fakeScene({ pointer: leftPointer, width: screenWidth });
		setJoystickSide(scene.game, "right");
		const controls = new TouchControls(scene, dialogueStub);
		controls.onPointerDown(leftPointer, []);
		assert.equal(controls.active, true, "a touch on the disallowed half must still be tracked for a tap");
		assert.equal(controls.allowDragHere, false, "...but must not be allowed to become a drag");
	}

	// Cycling and labels, for the settings row itself.
	assert.equal(nextJoystickSide(null), "left");
	assert.equal(nextJoystickSide("left"), "right");
	assert.equal(nextJoystickSide("right"), null);
	assert.equal(joystickSideLabel(null), "Both");
	assert.equal(joystickSideLabel("left"), "Left");
	assert.equal(joystickSideLabel("right"), "Right");

	// getJoystickSide must never throw where there is no registry at all (an even more minimal
	// stub than fakeScene provides) -- best-effort, like the zoom/text-scale settings' own reads.
	assert.equal(getJoystickSide({ registry: undefined }), null, "a missing registry must fall back to the default, not throw");
}

console.log("mobile-ui.test.mjs: joystick-side assertions passed");

// The 44x44 tap targets and the fold-up chevron (2026-09-14 UI-UX audit, item 5.2): the journal's
// own corner tab was 44x34 (under the 44pt minimum), and its expanded-state glyph was "x", which
// reads as "close the game" next to a panel that only folds the journal away.
{
	assert.match(journal, /TAB_SIZE = \{ width: 44, height: 44 \}/, "the journal tab must be a full 44x44 tap target, not 44x34");
	// Since the 2026-09-15 icon-grammar pass the glyph is a pixel icon texture, not a font glyph.
	assert.match(
		journal,
		/__glyph\.setTexture\(this\.collapsed \? "icon-menu" : "icon-chevron-up"\)/,
		"the expanded glyph must be a fold-up chevron, not \"x\" (which reads as \"close the game\")",
	);
}

// The settings gear must never overlap the journal, collapsed or expanded (2026-09-14 audit): both
// files coordinate through one registry key rather than holding a direct reference to each other.
{
	const settings = readFileSync("src/systems/SettingsUI.ts", "utf8");
	assert.match(journal, /export const JOURNAL_BOTTOM_KEY/, "JournalUI must publish its current bottom edge for the gear to read");
	assert.match(settings, /JOURNAL_BOTTOM_KEY/, "SettingsUI must read the journal's bottom edge when positioning its own gear/panel");
	assert.match(settings, /TAB_SIZE = \{ width: 44, height: 44 \}/, "the settings gear must also be a full 44x44 tap target");
	assert.match(
		settings,
		/gearY = Math\.min\(height - TAB_SIZE\.height - 8, Math\.max\([^,]+, journalBottom \+ TAB_GAP\)\)/,
		"the gear must follow the journal while staying on-screen",
	);
}

// The panel is sized from its own content, not fixed row-height guesses (2026-09-14 audit, item
// 5.1): the hen-progress row ("Hens home: 0/3") used to be clipped by a fixed 24px allowance
// against a taller, padded text object. Every section below now measures its real text height.
{
	assert.doesNotMatch(journal, /henRowH = henShown \? 24 : 0/, "the hen row must no longer use a fixed, clip-prone height");
	assert.doesNotMatch(journal, /errandRowH = errandShown \? 38 : 0/, "the errand row must no longer use a fixed height either");
	assert.match(journal, /henProgressLabel\.height \+ SECTION_PAD \* 2/, "the hen row's height must come from the label's own measured height");
	assert.match(journal, /getTextScale\(this\.scene\.game\)/, "the panel must read the text-size setting so a scaled-up font is measured, not guessed");
}

console.log("mobile-ui.test.mjs: journal-panel-height and tab/gear assertions passed");
