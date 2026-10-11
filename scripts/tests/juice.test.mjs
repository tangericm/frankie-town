import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

let osReduced = false;
const haptics = [];
const moduleObject = { exports: {} };
runInNewContext(ts.transpileModule(readFileSync("src/systems/juice.ts", "utf8"), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, {
	module: moduleObject, exports: moduleObject.exports,
	window: { matchMedia: () => ({ matches: osReduced }) },
	navigator: { vibrate: ms => haptics.push(ms) },
	require: id => id === "./audio" ? { getAudio: scene => ({ sfx: (...args) => scene.sounds.push(args) }) }
		: id === "./palette" ? { PALETTE: { css: { panelLight: "#fff", shadow: "#000" } } } : {},
});
const { burst, ring, hop, squash, floatPip, reward } = moduleObject.exports;

function object(x = 0, y = 0) {
	return {
		x, y, scaleX: 1, scaleY: 1, scene: {},
		setScale(x, y = x) { this.scaleX = x; this.scaleY = y; return this; },
		setY(y) { this.y = y; return this; },
		setDepth(depth) { this.depth = depth; return this; },
		setStrokeStyle() { return this; }, setOrigin() { return this; },
		explode(count) { this.count = count; }, destroy() { this.destroyed = true; },
	};
}
function scene(chosen) {
	const scene = { tweensLog: [], killed: [], particles: [], sounds: [], timers: [], game: { registry: { get: () => chosen } }, textures: { exists: () => true } };
	scene.add = {
		particles: (x, y, key, config) => { const emitter = Object.assign(object(x, y), { key, config }); scene.particles.push(emitter); return emitter; },
		circle: (x, y) => object(x, y), text: (x, y, text) => Object.assign(object(x, y), { text }),
	};
	scene.tweens = { add: config => scene.tweensLog.push(config), killTweensOf: target => scene.killed.push(target) };
	scene.time = { delayedCall: (ms, callback) => scene.timers.push({ ms, callback }) };
	return scene;
}

// Either preference must leave only stationary fades, without interrupting actor journeys.
for (const [os, chosen] of [[false, true], [true, false]]) {
	osReduced = os;
	const s = scene(chosen), hidden = [];
	const emitter = burst(s, 40, 50, 0xffcc00, o => hidden.push(o), { shape: "feather", count: 18, speed: { min: 50, max: 140 }, gravityY: 220, scale: 0.8, depth: 90 });
	assert.equal(emitter.count, 1);
	assert.equal(emitter.config.speed, 0);
	assert.equal(emitter.config.gravityY, 0);
	assert.equal(emitter.config.rotate, 0);
	assert.equal(emitter.config.scale.start, emitter.config.scale.end);
	assert.equal(emitter.config.alpha.end, 0);
	assert.equal(emitter.depth, 90);
	assert.equal(hidden[0], emitter, "burst retains its emitter and camera-hiding contract");
	s.timers.shift().callback();
	assert.equal(emitter.destroyed, true);
	const circle = ring(s, 40, 50, 0xffcc00);
	const pip = floatPip(s, 40, 30, "3/3");
	assert.equal(pip.text, "3/3");
	assert.equal(pip.scaleX, 1);
	for (const target of [circle, pip]) {
		const tween = s.tweensLog.find(t => t.targets === target);
		assert.equal(tween.alpha, 0);
		for (const key of ["x", "y", "scale", "scaleX", "scaleY", "angle"]) assert.equal(key in tween, false, `reduced fade must not change ${key}`);
		tween.onComplete();
		assert.equal(target.destroyed, true);
	}
	const frankie = object(100, 200).setScale(0.7, 0.8);
	hop(s, frankie);
	squash(s, frankie);
	assert.equal(frankie.y, 200);
	assert.equal(frankie.scaleX, 0.7);
	assert.equal(frankie.scaleY, 0.8);
	assert.equal(s.killed.length, 0, "decorative feedback must not cancel actor journeys");
	assert.equal(s.tweensLog.some(t => t.targets === frankie), false);
	assert.equal(s.sounds[0][0], "bark");
	reward.tick(s, frankie, "pickup");
	reward.pop(s, { x: 40, y: 50 }, 0xffcc00, undefined, { label: "3/3", frankie });
	for (const timer of s.timers) timer.callback();
	assert.equal(s.killed.length, 0);
	assert.equal(s.tweensLog.some(t => t.targets === frankie), false);
	assert.equal(s.sounds.map(([sound]) => sound).join(","), "bark,pickup,journal-tick,journal-tick");
	assert.equal(haptics.at(-1), 14);
}

// Ordinary feedback retains travelling particles, expanding rings and the happy hop.
osReduced = false;
const s = scene(false);
const emitter = burst(s, 40, 50, 0xffcc00, undefined, { shape: "feather" });
assert.equal(emitter.count, 10);
assert.equal(emitter.config.speed.min, 40);
assert.equal(emitter.config.speed.max, 120);
assert.equal(emitter.config.gravityY, 90);
assert.equal(emitter.config.rotate.end, 200);
assert.equal(emitter.config.scale.end, 0);
ring(s, 40, 50, 0xffcc00);
assert.equal(s.tweensLog.at(-1).scale, 2.2);
const frankie = object(100, 200);
hop(s, frankie);
assert.equal(s.tweensLog.at(-1).y, 190);
assert.equal(s.killed.at(-1), frankie);
squash(s, frankie);
assert.ok(frankie.scaleX > 1);
assert.equal(s.sounds[0][0], "bark");
console.log("juice.test.mjs: all assertions passed");
