import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
function load(file, dependencies={}) {
 const module={exports:{}};
 runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,require:id=>dependencies[id]??{}});
 return module.exports;
}
const {MemoryLane}=load('src/systems/market/MemoryLane.ts');
const lane=Object.create(MemoryLane.prototype);
Object.assign(lane,{solved:false,ropeUsable:false,stopped:false,started:true,accepting:false,presenting:true,attempt:{round:1,cursor:2,complete:false}});
let entered=0,cancelled=0;
Object.assign(lane,{cancelTimers(){cancelled++},resetMats(){},resetBaskets(){},refreshStatus(){},scheduleIdleReplay(){},enter(){entered++}});
lane.interactBasket('apple');
assert.equal(lane.accepting,true);assert.equal(lane.presenting,false);assert.equal(lane.attempt.cursor,0);
// The tap that cuts the Watch phase short is itself the
// first answer, so a player who already knows the pattern never has to press the first basket twice.
assert.equal(cancelled,1);assert.equal(entered,1,'the tap that skips Watch is the first answer');
lane.interactBasket('egg');assert.equal(entered,2,'next tap answers');
lane.accepting=false;lane.presenting=false;lane.interactBasket('apple');assert.equal(entered,2,'round transition does not accept input');
const lines={settled:[{text:'settled'}],curtains:[{text:'curtains'}]};
const {PaninisFlatGameplay}=load('src/systems/PaninisFlatGameplay.ts',{'../data/paninis-flat.gameplay':{PANINIS_LINES:lines,FRANKIE_ASIDE:{}}});
const panini=Object.create(PaninisFlatGameplay.prototype);
Object.assign(panini,{busy:false,services:{dialogueBox:{isActive:()=>false},gameState:{flag:()=>true}}});
let moved=0;panini.moveCat=()=>moved++;panini.say=(_lines,done)=>done?.();
for(let i=0;i<3;i++)panini.interact('curtains');
assert.equal(moved,0,'repeated curtain taps leave a settled cat in place');
console.log('playtest regressions: Watch skip and settled Panini passed');

// Neither a first lure nor early curtains can unlock the cupboard, in either order.
for (const order of [['toy','basket'],['basket','toy']]) {
 const flags = new Set(); let destination = null; let reward = false;
 const puzzle = Object.create(PaninisFlatGameplay.prototype);
 Object.assign(puzzle,{busy:false,services:{dialogueBox:{isActive:()=>false},gameState:{flag:id=>flags.has(id),setFlag:id=>flags.add(id),hasIngredient:()=>reward,addIngredient:()=>{reward=true}}}});
 puzzle.say=(_lines,done)=>done?.();puzzle.moveCat=r=>{destination=r};
 puzzle.interact('toy');assert.equal(destination,null,'toys are locked until Frankie has said hello');
 puzzle.interact('butter');
 puzzle.interact('curtains');assert.equal(destination,null,'curtains wait for both activities');
 for(const action of order){
  puzzle.interact(action);assert.equal(destination,action==='toy'?1:3);
  flags.add(action==='toy'?'paniniToyTried':'paniniBasketTried');destination=null;
  puzzle.interact(action);assert.equal(destination,null,'completed activities do not replay');
  puzzle.interact('butter');assert.equal(reward,false,'butter remains guarded after an activity');
 }
 puzzle.interact('curtains');assert.equal(destination,2,'sunlight is the final destination');
}
console.log('Panini progression: both activity orders and guarded butter passed');

// Solving the memory booth retires its presentation immediately, before the cube is collected.
{
 const {MemoryLane}=load('src/systems/market/MemoryLane.ts',{'../../data/market.gameplay':{MARKET_SYMBOLS:['feather','egg','apple']}});
 const booth=Object.create(MemoryLane.prototype);let saved=0,cancelled=0,hidden=0;const removed=[];
 Object.assign(booth,{ropeUsable:false,solved:false,presenting:true,accepting:true,ropeBlocker:null,
  cancelTimers(){cancelled++},resetMats(){},hidePips(){hidden++},onSolved(){saved++},
  uiObjects:[],status:{setVisible(value){assert.equal(value,false)}},baskets:new Map(),interactions:{removeZone(id){removed.push(id)}},
 });
 booth.makeRopeUsable();booth.makeRopeUsable();
 assert.equal(booth.solved,true);assert.equal(booth.accepting,false);assert.equal(booth.presenting,false);
 assert.equal(cancelled,1);assert.equal(saved,1);assert.equal(hidden,1);assert.equal(removed.length,3);
}
