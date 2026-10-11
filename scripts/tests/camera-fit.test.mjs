#!/usr/bin/env node
// The automatic zoom rule: desktop/landscape steps, and the portrait fill-the-height rule that
// replaced "a short room sitting under a dark band" on phones.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import tsCompiler from "typescript";

const js = tsCompiler.transpileModule(readFileSync("src/systems/cameraFit.ts", "utf8"), {
  compilerOptions: { module: tsCompiler.ModuleKind.CommonJS, target: tsCompiler.ScriptTarget.ES2020 },
}).outputText;
const m = { exports: {} };
runInNewContext(js, { module: m, exports: m.exports, require: () => ({}), window: { localStorage: { getItem: () => null, setItem() {} } } });
const { autoZoom, fitCameraToRoom, ROOM_SIZES, ROOM_ZOOM, NARROW_ZOOM, PORTRAIT_MAX_ZOOM, MIN_PORTRAIT_VISIBLE_WIDTH } = m.exports;

// Desktop: the authored zoom; a narrow landscape window: the narrow step. Portrait never applies.
assert.equal(autoZoom(1280, 800, ROOM_SIZES.Bakery), ROOM_ZOOM);
assert.equal(autoZoom(600, 400, ROOM_SIZES.Bakery), NARROW_ZOOM);
assert.equal(autoZoom(844, 390, ROOM_SIZES.Bakery), ROOM_ZOOM, "landscape phone keeps the landscape rule");

// Portrait phone, short room: zoom in until the room fills the height, capped by visible width.
{
  const z = autoZoom(390, 844, ROOM_SIZES.Bakery);
  assert.ok(z > NARROW_ZOOM, `bakery on a portrait phone zooms past narrow, got ${z}`);
  assert.ok(390 / z >= MIN_PORTRAIT_VISIBLE_WIDTH - 1, `keeps ${MIN_PORTRAIT_VISIBLE_WIDTH}px visible, got ${(390 / z).toFixed(0)}`);
  assert.ok(z <= PORTRAIT_MAX_ZOOM);
  assert.equal(z, 1.3);
  const apt = autoZoom(390, 844, ROOM_SIZES.Apartment);
  assert.equal(apt, 1.2, "the taller apartment needs less");
}
// Portrait but the room is already taller than the screen (market, street): no change.
assert.equal(autoZoom(390, 844, ROOM_SIZES.Market), NARROW_ZOOM);
assert.equal(autoZoom(390, 844, ROOM_SIZES.Street), NARROW_ZOOM);
// Unknown scene: the old behaviour.
assert.equal(autoZoom(390, 844, undefined), NARROW_ZOOM);
// A 320px phone already shows fewer than 300 world px at the narrow step, so the rule never zooms
// in further there: the base step stands.
assert.equal(autoZoom(320, 568, ROOM_SIZES.Bakery), NARROW_ZOOM);
// A short Panini room shares its unused portrait height, while Bakery keeps its south anchor.
for (const [key,height,divisor] of [['PaninisFlat',480,2],['Bakery',560,1]]) {
 const cam={width:390,height:844,scene:{scene:{key}},setBounds(x,y,w,h){this.bounds={x,y,w,h}}};
 fitCameraToRoom(cam,608,height,1.3);
 assert.equal(cam.bounds.y,(height-844/1.3)/divisor);
}
console.log("camera-fit.test.mjs: all assertions passed");
