import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import tsCompiler from "typescript";

// DialogueBox's continue mark (2026-09-14 UI-UX audit, item 5.3): after the typewriter finishes a
// page, a small mark should appear and bob; it must stay hidden while typing, and disappear when
// the box closes. Exercised against the real class -- with Phaser stubbed down to what DialogueBox
// actually calls -- rather than only asserting on the source text, since the show/hide transitions
// are the whole point and are easy to get backwards (e.g. showing on typeOut() instead of on its
// completion).

function load(file, requireStub) {
	const js = tsCompiler.transpileModule(readFileSync(file, "utf8"), {
		compilerOptions: { module: tsCompiler.ModuleKind.CommonJS, target: tsCompiler.ScriptTarget.ES2020 },
	}).outputText;
	const moduleObj = { exports: {} };
	runInNewContext(js, { module: moduleObj, exports: moduleObj.exports, require: requireStub, window: undefined });
	return moduleObj.exports;
}

const phaserStub = {
	Scenes: { Events: { SHUTDOWN: "shutdown" } },
	Scale: { Events: { RESIZE: "resize" } },
	// scheduleBlink() picks a random 3-6s gap via Phaser.Math.Between -- a fixed low value here
	// just means the blink timer (never asserted on by this file) fires immediately when tests
	// call scene.__runTimers(), which is harmless.
	Math: { Between: (min) => min },
};

/** A chainable fake Phaser game object (Text/Image/Graphics/Rectangle all behave the same way here
 * -- DialogueBox never reads anything back off them except `.text`/`.x`/`.y`/`.visible`/`.width`/
 * `.height`, all tracked below). */
function fakeGameObject(overrides = {}) {
	const obj = {
		x: 0, y: 0, visible: true, alpha: 1, scaleX: 1, scaleY: 1,
		width: 100, height: 20, text: "",
		...overrides,
	};
	const chain = (fn) => (...args) => { fn(...args); return obj; };
	obj.setPosition = chain((x, y) => { obj.x = x; obj.y = y; });
	obj.setY = chain((y) => { obj.y = y; });
	obj.setOrigin = chain(() => {});
	obj.setVisible = chain((v) => { obj.visible = v; });
	obj.setAlpha = chain((a) => { obj.alpha = a; });
	obj.setScale = chain((s) => { obj.scaleX = s; obj.scaleY = s; });
	obj.setColor = chain(() => {});
	obj.setTint = chain(() => {});
	obj.setFontStyle = chain(() => {});
	obj.setFontSize = chain((s) => { obj.fontSize = s; });
	obj.setWordWrapWidth = chain(() => {});
	obj.setDisplaySize = chain((w, h) => { obj.width = w; obj.height = h; });
	obj.setSize = chain((w, h) => { obj.width = w; obj.height = h; });
	obj.setTexture = chain(() => {});
	obj.setStrokeStyle = chain(() => {});
	obj.setScrollFactor = chain(() => {});
	obj.setDepth = chain(() => {});
	obj.setInteractive = chain(() => {});
	obj.on = chain(() => {});
	obj.setText = chain((t) => { obj.text = t; });
	// A single "line" always -- buildPages' own multi-line pagination is DialogueBox's own concern
	// and isn't what this file is testing; the continue mark's show/hide logic doesn't depend on it.
	obj.getWrappedText = (t) => [t];
	return obj;
}

function fakeContainer() {
	const obj = fakeGameObject();
	obj.list = [];
	obj.add = (children) => { obj.list.push(...(Array.isArray(children) ? children : [children])); return obj; };
	obj.addAt = (child, idx) => { obj.list.splice(idx, 0, child); return obj; };
	return obj;
}

/** Tween/time stubs: tweens with an `onComplete` and no `repeat` fire it immediately (treats the
 * pop-in/close fades as instant, which is all this file needs); an infinite bob tween (repeat:-1)
 * is just recorded so its shape (yoyo, a 3px delta) can be asserted on. `time.addEvent` events are
 * run on demand via `scene.__runTimers()`, standing in for real per-frame delay callbacks. */
function fakeScene() {
	const timeEvents = [];
	const tweenLog = [];
	const store = new Map();
	const registryHandlers = new Map();
	const registry = {
		get: (k) => store.get(k),
		set: (k, v) => store.set(k, v),
		events: {
			on(name, fn) { registryHandlers.set(name, fn); },
			off(name) { registryHandlers.delete(name); },
		},
	};
	return {
		scale: { width: 720, height: 200, on() {}, off() {} },
		game: { registry },
		add: {
			container: () => fakeContainer(),
			graphics: () => fakeGameObject({
				clear() { return this; }, fillStyle() { return this; }, fillRoundedRect() { return this; },
				lineStyle() { return this; }, strokeRoundedRect() { return this; },
				fillCircle() { return this; }, strokeCircle() { return this; },
			}),
			text: (_x, _y, t) => fakeGameObject({ text: t }),
			image: () => fakeGameObject(),
			rectangle: () => fakeGameObject(),
			nineslice: () => fakeGameObject(),
		},
		textures: { exists: () => false },
		tweens: {
			add(cfg) {
				tweenLog.push(cfg);
				if (typeof cfg.onComplete === "function" && !cfg.repeat) cfg.onComplete();
				return { remove() {}, pause() {}, resume() {} };
			},
			killTweensOf() {},
		},
		time: {
			addEvent(cfg) {
				const ev = { ...cfg, removed: false, remove() { ev.removed = true; } };
				timeEvents.push(ev);
				return ev;
			},
			// The idle-blink loop (scheduleBlink/playBlink) uses a one-shot delayedCall, re-scheduling
			// itself from within its own callback -- deliberately NOT wired into `timeEvents`/
			// `__runTimers()` (which treats every entry as an addEvent-style repeater and would spin
			// forever re-triggering a self-rescheduling one-shot). Nothing in this file asserts on the
			// blink, so it only ever needs to exist, not fire.
			delayedCall(delay, callback) {
				const ev = { delay, callback, removed: false, remove() { ev.removed = true; } };
				return ev;
			},
		},
		events: { on() {}, off() {}, once() {}, emit() {} },
		__tweenLog: tweenLog,
		__runTimers() {
			for (const ev of timeEvents) {
				let guard = 0;
				while (!ev.removed && guard < 10000) {
					ev.callback();
					guard += 1;
				}
			}
		},
	};
}

const textScale = load("src/systems/textScale.ts", (id) => (id.includes("phaser") ? { __esModule: true, default: phaserStub, ...phaserStub } : {}));
const DialogueBox = load("src/systems/DialogueBox.ts", (id) => {
	if (id === "./textScale") return textScale;
	if (id === "./palette") return { PALETTE: new Proxy({ css: new Proxy({}, { get: () => "#000000" }) }, { get: (t, k) => (k in t ? t[k] : 0x000000) }) };
	if (id === "./panel") return { drawPanel: () => {} };
	// A BitmapText stands in fine as a plain fake Text object here -- this file only ever reads
	// `.text`/`.x`/`.y`/`.visible`/`.width`/`.height` back off it, all of which fakeGameObject
	// already tracks the same way for every other game object type.
	if (id === "./pixelText") return { addPixelText: (scene, x, y, text, opts) => scene.add.text(x, y, text, opts) };
	if (id === "./DialogueSequencer") return load("src/systems/DialogueSequencer.ts", () => ({}));
	// The 2026-09-15 UI revamp phase 4 motion tokens/text-speed setting -- stubbed rather than
	// loaded for real, same reasoning as every other dependency here: this file exercises the
	// continue-mark/tap-plate behaviour, not motion.ts's or juice.ts's own tweening (which drags in
	// audio.ts and a real Phaser runtime through juice.ts's transitive imports).
	if (id === "./motion") return {
		MOTION: { duration: { panelOpen: 300, panelClose: 200, badge: 160, press: 90, stagger: 40, staggerCap: 300 }, ease: { open: "Back.easeOut", close: "Quad.easeIn" } },
		openPanel: (scene, target) => { target.setVisible?.(true); target.setScale?.(1); target.setAlpha?.(1); },
		closePanel: (scene, target, onDone) => onDone?.(),
	};
	if (id === "./juice") return { reducedMotion: () => false };
	if (id === "./textSpeed") return { getTextSpeed: () => "normal", charDelayMs: () => 22 };
	if (id.includes("phaser")) return { __esModule: true, default: phaserStub, ...phaserStub };
	return {};
}).DialogueBox;

// Fresh box: the mark exists and is hidden before anything has played.
{
	const scene = fakeScene();
	const box = new DialogueBox(scene);
	assert.equal(box.continueMark.visible, false, "the continue mark must start hidden");
}

// Typing in progress: still hidden. Typing complete: shown, bobbing 3px, yoyo.
{
	const scene = fakeScene();
	const box = new DialogueBox(scene);
	box.play([{ speaker: "Teddy", text: "Welcome to the bakery, Frankie!" }]);
	assert.equal(box.continueMark.visible, false, "the mark must stay hidden while the typewriter is still running");

	scene.__runTimers();
	assert.equal(box.continueMark.visible, true, "the mark must appear once the page has fully typed out");
	const bob = scene.__tweenLog.find((t) => t.targets === box.continueMark && t.repeat === -1);
	assert.ok(bob, "the mark's bob must be an infinite (repeat: -1) tween, not a one-shot");
	assert.equal(bob.yoyo, true, "the bob must yoyo back to its start, not just move once");
	assert.equal(Math.abs(bob.y - box.continueMarkBaseY) <= 3.0001 && bob.y < box.continueMarkBaseY, true, "the bob must move up by about 3px");
}

// Fast-forwarding a still-typing page (advance() while typing) must also reveal the mark --
// the player just asked the box to skip ahead, and the page is now fully shown.
{
	const scene = fakeScene();
	const box = new DialogueBox(scene);
	box.play([{ speaker: "Teddy", text: "A rather long line that would normally take a while to type out fully." }]);
	assert.equal(box.continueMark.visible, false);
	box.advance(); // fast-forward
	assert.equal(box.continueMark.visible, true, "fast-forwarding to the end of a page must also show the continue mark");
}

// Moving to the next line hides the mark again while that line types, then re-shows it.
{
	const scene = fakeScene();
	const box = new DialogueBox(scene);
	box.play([
		{ speaker: "Teddy", text: "First line." },
		{ speaker: "Teddy", text: "Second line." },
	]);
	scene.__runTimers();
	assert.equal(box.continueMark.visible, true, "first line finishes typing and shows the mark");
	box.advance(); // moves to the second line, which starts typing again
	assert.equal(box.continueMark.visible, false, "starting the next line's typewriter must hide the mark again");
	scene.__runTimers();
	assert.equal(box.continueMark.visible, true, "the second line finishing must show the mark again");
}

// Closing the box (advancing past the last line) must hide the mark, not leave it bobbing behind
// a closed panel.
{
	const scene = fakeScene();
	const box = new DialogueBox(scene);
	box.play([{ speaker: "Teddy", text: "Only line." }]);
	scene.__runTimers();
	assert.equal(box.continueMark.visible, true);
	box.advance(); // no more lines -- closes
	assert.equal(box.continueMark.visible, false, "closing the dialogue must hide the continue mark");
}

console.log("dialogue-box.test.mjs: continue-mark assertions passed");

// The panel's plate is an interactive, screen-pinned hit area (2026-09-14 audit, item 5.3) -- so
// TouchControls' "UI owns its gesture" ownership check (isScreenUI, which walks the parentContainer
// chain looking for scrollFactorX === 0) recognises a tap on the dialogue panel as this panel's,
// the same way the journal tab and settings gear already do. TouchControls itself still does the
// actual advancing (via dialogueBox.isActive()) -- this plate must not add its own pointerdown
// handler, or a single tap would advance the dialogue twice.
{
	const scene = fakeScene();
	const box = new DialogueBox(scene);
	assert.ok(box.tapPlate, "the tap plate must exist");
	assert.ok(box.container.list.includes(box.tapPlate), "the tap plate must live inside the screen-pinned container");
}
const src = readFileSync("src/systems/DialogueBox.ts", "utf8");
assert.match(
	src,
	/this\.tapPlate = scene\.add\.rectangle\([^;]*\.setInteractive\(\)/,
	"the tap plate must be interactive, so TouchControls' isScreenUI ownership check can see it",
);
assert.equal(
	/tapPlate[\s\S]{0,120}\.on\("pointerdown"/.test(src),
	false,
	"the tap plate must not register its own pointerdown handler -- TouchControls already advances on any tap while the box is open, and a second handler would double-advance",
);

console.log("dialogue-box.test.mjs: tap-plate assertions passed");
