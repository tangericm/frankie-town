#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import tsCompiler from "typescript";

const js = tsCompiler.transpileModule(readFileSync("src/systems/pathfinding.ts", "utf8"), {
  compilerOptions: { module: tsCompiler.ModuleKind.CommonJS, target: tsCompiler.ScriptTarget.ES2020 },
}).outputText;
const m = { exports: {} };
runInNewContext(js, { module: m, exports: m.exports, require: () => ({}) });
const { buildGrid, findPath, nearestFreeCell, toCell, isFree } = m.exports;
const BODY = { width: 28, height: 14 };

// An open room: a straight path is one waypoint (the goal).
{
  const grid = buildGrid({ x: 0, y: 0, width: 320, height: 320 }, [], BODY);
  const path = findPath(grid, { x: 40, y: 40 }, { x: 280, y: 40 });
  assert.ok(path && path.length === 1, `straight run collapses to the goal, got ${JSON.stringify(path)}`);
  assert.ok(Math.abs(path[0].x - 280) <= 4 && Math.abs(path[0].y - 40) <= 4);
}

// A wall with a gap: the path goes through the gap, never through the wall, and never cuts a
// corner the body cannot pass.
{
  const wall = [{ x: 150, y: 0, width: 20, height: 200 }, { x: 150, y: 260, width: 20, height: 60 }];
  const grid = buildGrid({ x: 0, y: 0, width: 320, height: 320 }, wall, BODY);
  const path = findPath(grid, { x: 40, y: 40 }, { x: 280, y: 40 });
  assert.ok(path, "must find a way through the gap");
  // Every waypoint stands on free floor, and the crossing happens inside the gap (y 200..260).
  for (const p of path) { const { c, r } = toCell(grid, p.x, p.y); assert.ok(isFree(grid, c, r), `waypoint ${JSON.stringify(p)} is blocked`); }
  const crossing = path.find((p) => p.x > 150 && p.x < 170) ?? path.find((p) => p.x >= 170);
  assert.ok(crossing && crossing.y > 200 && crossing.y < 260 + 14, `crossing should be inside the gap, got ${JSON.stringify(path)}`);
}

// Unreachable: fully walled goal returns null; a tap on a blocked cell snaps to the nearest free one.
{
  const box = [{ x: 200, y: 200, width: 100, height: 100 }];
  const grid = buildGrid({ x: 0, y: 0, width: 320, height: 320 }, box, BODY);
  const cell = nearestFreeCell(grid, 250, 250);
  assert.ok(cell && !(cell.c * 8 > 200 - 14 && cell.c * 8 < 300 && cell.r * 8 > 200 && cell.r * 8 < 314), "snaps outside the box");
  const sealed = [{ x: 0, y: 150, width: 320, height: 20 }];
  const grid2 = buildGrid({ x: 0, y: 0, width: 320, height: 320 }, sealed, BODY);
  assert.equal(findPath(grid2, { x: 40, y: 40 }, { x: 40, y: 300 }), null, "no path across a full-width wall");
}

// Body size matters: a 20px gap is impassable for a 28px body but passable for a 12px one.
{
  const walls = [{ x: 0, y: 100, width: 150, height: 20 }, { x: 170, y: 100, width: 150, height: 20 }];
  const wide = buildGrid({ x: 0, y: 0, width: 320, height: 320 }, walls, BODY);
  const narrow = buildGrid({ x: 0, y: 0, width: 320, height: 320 }, walls, { width: 12, height: 14 });
  assert.equal(findPath(wide, { x: 160, y: 40 }, { x: 160, y: 300 }), null);
  assert.ok(findPath(narrow, { x: 160, y: 40 }, { x: 160, y: 300 }));
}

console.log("pathfinding.test.mjs: all assertions passed");

// Cat routes lose grid stair-steps on open floor, but never cut through furniture corners.
{
 const {smoothPath}=m.exports;
 const body={width:24,height:10};
 const start={x:60,y:60}, goal={x:240,y:200};
 const direct=smoothPath(start,[{x:100,y:60},{x:100,y:100},{x:160,y:160},goal],[],body);
 assert.equal(direct.length,1,'open floor should be a single smooth leg');
 const wall={x:140,y:80,width:24,height:170};
 const grid=buildGrid({x:0,y:0,width:320,height:320},[wall],body,4);
 const path=smoothPath(start,findPath(grid,start,goal),[wall],body);
 assert.ok(path.length>1,'furniture still requires a bend');
 let from=start;
 for(const to of path){
  for(let t=0;t<=1;t+=0.005){
   const x=from.x+(to.x-from.x)*t,y=from.y+(to.y-from.y)*t;
   assert.ok(!(x-body.width/2<wall.x+wall.width&&x+body.width/2>wall.x&&y-body.height<wall.y+wall.height&&y>wall.y),'swept body clears wall');
  }
  from=to;
 }
}
