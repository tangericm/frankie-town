import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import tsCompiler from "typescript";

const src = readFileSync("src/systems/InteractionManager.ts", "utf8");
const js = tsCompiler.transpileModule(src, {
  compilerOptions: { module: tsCompiler.ModuleKind.CommonJS, target: tsCompiler.ScriptTarget.ES2020 },
}).outputText;

const moduleObj = { exports: {} };
const nav = { exports: {} };
runInNewContext(tsCompiler.transpileModule(readFileSync('src/systems/pathfinding.ts', 'utf8'), {
  compilerOptions: { module: tsCompiler.ModuleKind.CommonJS },
}).outputText, {module: nav, exports: nav.exports});
runInNewContext(js, { module: moduleObj, exports: moduleObj.exports, require: (id) => id === './pathfinding' ? nav.exports : {} });
const { nearestInRange } = moduleObj.exports;

// Reach follows an authored ground footprint, not one preferred standing point beside it.
{
  const pile = {id:'produce',x:389,y:640,radius:28,reachBounds:{x:412,y:604,width:110,height:42}};
  for(const [x,y] of [[390,625],[544,625],[467,588],[467,671],[394,586],[540,586],[394,664],[540,664]]) {
    assert.equal(nearestInRange([pile],x,y),pile.id,`reachable edge ${x},${y}`);
  }
  assert.equal(nearestInRange([pile],555,625),null,'footprint reach is bounded');
  const bed={id:'bed',x:168,y:430,radius:26,reachBounds:{x:87,y:425,width:100,height:15}};
  const wall={x:192,y:368,width:16,height:80};
  assert.equal(nearestInRange([bed],222,430,'west',[wall]),null,'bed cannot be inspected through its partition');
  assert.equal(nearestInRange([bed],168,409,'south',[wall]),'bed','the bed itself may block walking; touching its edge still works');
  const bike={id:'bike',x:860,y:530,radius:34,reachBounds:{x:867,y:569,width:45,height:21}};
  assert.equal(nearestInRange([bike],880,530,'south',[{x:848,y:544,width:192,height:160}]),'bike','viewing a prop on its own blocked support remains possible');
}

const zones = [
  { id: "teddy", x: 321, y: 194, radius: 44 },
  { id: "whisk", x: 180, y: 310, radius: 20 },
];

// Nothing in range.
assert.equal(nearestInRange(zones, 0, 0), null);

// Exactly one zone in range.
assert.equal(nearestInRange(zones, 185, 312), "whisk");

// Two zones overlapping at a shared point: the nearer one wins, not the first one listed.
const overlapping = [
  { id: "far", x: 130, y: 100, radius: 30 },
  { id: "near", x: 100, y: 100, radius: 30 },
];
assert.equal(nearestInRange(overlapping, 110, 100), "near");

// On the radius boundary counts as in range (<=, not <).
assert.equal(nearestInRange([{ id: "a", x: 0, y: 0, radius: 10 }], 10, 0), "a");

// Break caught: the Market memory baskets sit 29px apart on one stand and their interact radius had
// to grow to 44 so Frankie can reach them at all from the only spot the counter lets her stand
// (y367). Overlapping radii are only harmless because nearestInRange resolves by exact distance --
// standing in front of one basket must still select that basket, not a neighbour.
{
  const standingY = 367;
  const baskets = [
    { id: "feather", x: 183, y: 328, radius: 44 },
    { id: "egg", x: 212, y: 328, radius: 44 },
    { id: "apple", x: 241, y: 328, radius: 44 },
  ];
  for (const basket of baskets) {
    assert.equal(nearestInRange(baskets, basket.x, standingY), basket.id, `standing at ${basket.id} must select ${basket.id}`);
  }
  // And every basket must actually be in range from there -- a 16px radius reached none of them.
  for (const basket of baskets) {
    assert.ok(nearestInRange(baskets, basket.x, standingY) !== null, `${basket.id} must be reachable from the counter`);
  }
  const supported=baskets.map(b=>({...b,reachBounds:{x:b.x-9,y:328,width:18,height:25}}));
  assert.equal(nearestInRange(supported,292,328),'apple','rightmost answer is reachable beside the counter without turning first');
  assert.equal(nearestInRange(supported,142,328),'feather','leftmost answer is reachable beside the counter');
  for(const b of supported)assert.equal(nearestInRange(supported,b.x,standingY),b.id,'answer columns still select distinctly from the front');
}

// Break caught: icon-interact is a speech bubble whose tail hangs off the bottom-LEFT (tip at local
// (11,26) of a 32px icon). Centring the container on an NPC therefore pointed the tail five pixels
// to his left -- "the NPC dialogue icon is not really centered well... offset into the left".
// badgeAnchor exists so the TIP lands on the zone point, and so a scene drawing its own always-on
// badge (Pierre's onboarding one) lands in exactly the same place instead of stacking beside it.
{
  const { badgeAnchor, BADGE_TIP } = moduleObj.exports;
  const tip = BADGE_TIP["icon-interact"];
  // Compared field-by-field: the module runs in its own vm context, so deepStrictEqual would fail on
  // the cross-realm prototype rather than on the values.
  assert.equal(tip.x, -5, "measured off icon-interact's own alpha channel: tail tip is 5px left of centre");
  assert.equal(tip.y, 10, "...and 10px below it");
  const npc = { x: 321, y: 194 };
  const anchor = badgeAnchor(npc.x, npc.y, 58);
  assert.equal(anchor.x + tip.x, npc.x, "the bubble's tail must land on the NPC's own x");
  assert.equal(anchor.y + tip.y, npc.y - 58, "the tail must land indicatorOffset above the NPC");
}

// Break caught (mobile): a zone's sprite is still standing in the scene after its zone is removed
// -- the market gate is exactly that, still there once it has been opened -- and an input-enabled
// sprite keeps consuming touches whether or not anything listens for them. TouchControls declines to
// start the joystick on a touch an interactable owns, so a 128px dead hit area sat over the hen
// yard and the stick silently refused to appear across a large part of the one area the game asks
// you to chase things around in. removeZone has to hand the hit area back, not just forget the zone.
{
  const source = readFileSync("src/systems/InteractionManager.ts", "utf8");
  assert.match(source, /removeZone\(id: string\)[\s\S]{0,1100}?disableInteractive\(\)/, "removeZone must give the sprite's hit area back");
  assert.match(source, /removeZone\(id: string\)[\s\S]{0,1100}?off\(this\.isTouch \? "pointerup" : "pointerdown", registered\.handler\)/, "removeZone must drop the pointerdown handler it added");
  assert.match(source, /ownsTouch\(objects: Phaser\.GameObjects\.GameObject\[\]\): boolean/, "TouchControls needs a range-aware answer to \"does an interactable own this touch\"");
  // ...and that answer must be about range, not merely about being a zone at all: pressing an NPC
  // across the room used to swallow the touch and do nothing with it.
  assert.match(source, /ownsTouch\([\s\S]{0,600}?this\.nearest\(this\.zones/, "ownsTouch must decide on range, not on the mere existence of a zone");
}


// Break caught (mobile): a prop-thought zone ("the coop") was registered 17px from the market gate
// zone, and the bakery's "bread basket" thought sat on top of a hiding-spot chair. Nearest-by-
// distance then handed Frankie the flavour line and made the gate / the errand item unreachable
// from where he naturally stands. Priority settles it: a lower-priority zone is only picked when
// nothing higher is in range, and distance breaks ties among equals.
{
  const gateAndThought = [
    { id: "market-gate", x: 169, y: 826, radius: 58 },
    { id: "thought:coop", x: 175, y: 815, radius: 40, priority: -1 },
  ];
  assert.equal(nearestInRange(gateAndThought, 172, 800), "market-gate", "the gate must win where both are in range");
  assert.equal(nearestInRange(gateAndThought.slice(1), 172, 800), "thought:coop", "the thought is reachable once the gate zone is gone");
  const equalPriority = [
    { id: "a", x: 0, y: 0, radius: 30, priority: 0 },
    { id: "b", x: 20, y: 0, radius: 30 },
  ];
  assert.equal(nearestInRange(equalPriority, 15, 0), "b", "undefined priority is 0; ties go to the nearer zone");
  const higherFarther = [
    { id: "flavour", x: 0, y: 0, radius: 30, priority: -1 },
    { id: "quest", x: 25, y: 0, radius: 30, priority: 0 },
  ];
  assert.equal(nearestInRange(higherFarther, 2, 0), "quest", "a farther higher-priority zone beats a nearer lower one");
  assert.equal(nearestInRange(higherFarther, -10, 0), "flavour", "out of the quest zone's range, the flavour zone is picked");
}

// Facing-aware reach: side-on approaches leave Frankie's foot point 8-12px further out than a
// head-on one (his body plus the prop's collider), which is the "works from the front, not from the
// side" report. A zone he is turned towards counts FACING_REACH_BONUS px closer; one behind him does
// not, so walking past a prop never grabs it.
{
  const { FACING_REACH_BONUS } = moduleObj.exports;
  assert.equal(FACING_REACH_BONUS, 12);
  const zones = [{ id: "fern", x: 100, y: 320, radius: 30 }];
  assert.equal(nearestInRange(zones, 136, 320), null, "36px out, no facing: out of range");
  assert.equal(nearestInRange(zones, 136, 320, "west"), "fern", "36px out but facing it: in range");
  assert.equal(nearestInRange(zones, 136, 320, "east"), null, "facing away: no bonus");
  assert.equal(nearestInRange(zones, 136, 320, "north"), null, "perpendicular: no bonus");
  assert.equal(nearestInRange(zones, 146, 320, "west"), null, "bonus is 12px, not unlimited");
}

console.log("interaction-nearest.test.mjs: all assertions passed");

// Scripted opening/baking locks also cover direct sprite taps, not only scene.update.
{
  const { InteractionManager } = moduleObj.exports;
  const manager = Object.create(InteractionManager.prototype);
  let taps = 0;
  let paths = 0;
  let handler;
  const world = { isPaused: true };
  Object.assign(manager, {
    scene: { physics: { world }, input: {hitTestPointer:()=>[target]}, events: { emit() { paths++; } } },
    zones: [], touchHandlers: new Map(), consumedPointers: new Map(), isTouch: false,
    getPlayerPosition: () => ({ x: 0, y: 0 }), getPlayerFacing: () => 'south',
  });
  const target = { scene: {}, setInteractive() {}, on(_event, fn) { handler = fn; } };
  manager.addZone({ id: 'prop', x: 0, y: 0, radius: 10, gameObject: target, onInteract() { taps++; } });
  handler({});
  assert.equal(taps, 0, 'a paused world must reject a direct object tap');
  manager.getPlayerPosition = () => ({ x: 200, y: 200 });
  handler({});
  assert.equal(paths, 0, 'a paused world must not queue an interaction path');
  world.isPaused = false;
  manager.getPlayerPosition = () => ({ x: 0, y: 0 });
  handler({});
  assert.equal(taps, 1, 'normal interaction returns when the sequence releases control');
  const closing = {id:0,downTime:100};
  manager.consumePointer(closing);
  handler(closing);
  assert.equal(taps,1,'a dialogue-closing gesture must not become a fresh object interaction');
  handler({id:0,downTime:101});
  assert.equal(taps,2,'a new gesture on the same pointer still works');
  manager.scene.data={get:()=>true};
  handler({id:0,downTime:102});
  assert.equal(taps,2,'a remaining HUD owner blocks world taps even if physics was resumed');
  manager.scene.data={get:()=>false};
  let npcTaps=0;
  const npcTarget={scene:{},setInteractive(){},on(){}};
  manager.addZone({id:'nearby-npc',x:0,y:0,radius:50,priority:1,gameObject:npcTarget,onInteract(){npcTaps++;}});
  assert.equal(manager.nearestId(),'nearby-npc','keyboard selection keeps quest/NPC priority');
  assert.equal(manager.ownsTouch([target]),true,'a usable explicit object tap owns the touch even beside an NPC');
  handler({id:0,downTime:103});
  assert.equal(taps,3,'tapping a distinct object selects that object, not an adjacent NPC');
  assert.equal(npcTaps,0);
  manager.scene.input.hitTestPointer=()=>[target,npcTarget];
  handler({id:0,downTime:104});
  assert.equal(npcTaps,1,'overlapping painted targets still respect quest priority');
}

// Small pickups retain their painted size but get a 44 CSS-pixel target at every zoom.
{
  const manager = Object.create(moduleObj.exports.InteractionManager.prototype);
  const scene = { cameras: { main: { zoom: 0.7 } }, scale: { displayScale: { x: 1, y: 1 } } };
  manager.scene = scene;
  const area = { setTo(x,y,width,height) { Object.assign(this,{x,y,width,height}); } };
  const image = { scene, width:54,height:36,scaleX:1/3,scaleY:1/3,input:{hitArea:area} };
  const zone = { gameObject:image,minTapSize:44 };
  for (const zoom of [0.7,1,1.3]) {
    scene.cameras.main.zoom=zoom;
    manager.syncTapTarget(zone);
    assert.ok(area.width*image.scaleX*zoom>=44-1e-8);
    assert.ok(area.height*image.scaleY*zoom>=44-1e-8);
    assert.equal(area.x+area.width/2,image.width/2,'target stays centered on the image');
  }
  scene.scale.displayScale={x:2,y:2};
  manager.syncTapTarget(zone);
  assert.ok(area.width*image.scaleX*scene.cameras.main.zoom/2>=44-1e-8,'CSS scaling is included');
  assert.equal(image.width,54,'painted image stays unchanged');
}
