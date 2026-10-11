import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import tsCompiler from "typescript";

const src = readFileSync("src/systems/npcCollider.ts", "utf8");
const js = tsCompiler.transpileModule(src, {
	compilerOptions: { module: tsCompiler.ModuleKind.CommonJS, target: tsCompiler.ScriptTarget.ES2020 },
}).outputText;

const moduleObj = { exports: {} };
runInNewContext(js, { module: moduleObj, exports: moduleObj.exports, require: () => ({}) });
const { footprintRect } = moduleObj.exports;

assert.equal(typeof footprintRect, "function", "footprintRect must exist");

assert.deepEqual(
	Object.assign({}, footprintRect({ id: "rafa", x: 266, y: 368, width: 28, height: 14 })),
	{ x: 266, y: 361, width: 28, height: 14 },
	"box bottom edge (y + height/2) must land exactly on the NPC's foot-anchor y"
);
assert.deepEqual(
	Object.assign({}, footprintRect({ id: "teddy", x: 321, y: 194, width: 28, height: 14 })),
	{ x: 321, y: 187, width: 28, height: 14 }
);

console.log("npc-collider.test.mjs: all assertions passed");
