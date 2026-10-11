import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
function load(file){const m={exports:{}};runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:id=>id==='phaser'?{}:load(path.resolve(path.dirname(file),id+'.ts'))});return m.exports;}
const {GameState}=load('src/systems/GameState.ts');const {DINNER_CLUES,DINNER_DESTINATION,dinnerCluesFound}=load('src/data/dinner.ts');
const {DINNER_GRID,DINNER_WORDS,dinnerWordPath,dinnerWordAt,dinnerLeftovers}=load('src/data/dinnerPuzzle.ts');
const {currentObjective}=load('src/data/objectives.ts');
assert.equal(DINNER_DESTINATION,'Ichika');
assert.equal(DINNER_GRID.length,7);assert.ok(DINNER_GRID.every(row=>row.length===6));
const consumed=new Set();
for(const entry of DINNER_WORDS){
 const path=dinnerWordPath(entry.start,entry.end);
 for(const cell of path){assert.equal(consumed.has(cell),false,entry.word+' must not reuse a consumed letter');consumed.add(cell);}
 assert.equal(path.map(i=>DINNER_GRID[Math.floor(i/6)][i%6]).join(''),entry.word);
 assert.equal(dinnerWordAt(entry.start,entry.end).word,entry.word);
 let matches=0;
 for(let r=0;r<DINNER_GRID.length;r++)for(let c=0;c<6;c++)for(const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,-1],[1,-1],[-1,1]]){
  const letters=[...entry.word].map((_,i)=>DINNER_GRID[r+dr*i]?.[c+dc*i]??'').join('');
  if(letters===entry.word)matches++;
 }
 assert.equal(matches,1,entry.word+' has exactly one path, including unintended directions');
 let connected=0;
 const follow=(cell,at,used)=>{
  if(DINNER_GRID[Math.floor(cell/6)][cell%6]!==entry.word[at])return;
  if(at===entry.word.length-1){connected++;return;}
  const next=new Set([...used,cell]),r=Math.floor(cell/6),c=cell%6;
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const nr=r+dr,nc=c+dc,target=nr*6+nc;if((dr||dc)&&nr>=0&&nr<DINNER_GRID.length&&nc>=0&&nc<6&&!next.has(target))follow(target,at+1,next);}
 };
 for(let cell=0;cell<DINNER_GRID.length*6;cell++)follow(cell,0,new Set());
 assert.equal(connected,1,entry.word+' has no alternative spelling even along a bending or diagonal route');
}
assert.equal(consumed.size,36,'every answer owns all of its letters');
for(const [a,b] of [[-1,0],[0,42],[6,5],[0,7],[5,6],[0,0.5],[NaN,3]])assert.equal(dinnerWordPath(a,b).length,0,'invalid path');
assert.equal(dinnerWordAt(0,0),undefined);assert.equal(dinnerWordAt(0,4),undefined,'extra letters do not count as an answer');
const leftovers=dinnerLeftovers(DINNER_WORDS.map(e=>e.word));
assert.equal(leftovers.length,6);assert.equal(leftovers.map(i=>DINNER_GRID[Math.floor(i/6)][i%6]).join(''),'ICHIKA');
assert.equal(dinnerLeftovers([]).length,42);assert.equal(dinnerLeftovers(['FLOUR','FLOUR']).length,37,'duplicates cannot inflate coverage');
const paper=new GameState();paper.setFlag('dinnerWord:FLOUR');paper.bump('dinnerHint:CAKE',2);paper.setFlag('dinnerDecoded');
const resumed=GameState.fromJSON(paper.toJSON());assert.ok(resumed.flag('dinnerWord:FLOUR'));assert.equal(resumed.count('dinnerHint:CAKE'),2);assert.ok(resumed.flag('dinnerDecoded'));assert.equal(resumed.flag('dinnerRevealed'),false,'decoding does not keep the note');
assert.ok(DINNER_CLUES.every(c=>c.memory.length>0),'all three keepsakes supply replayable clue fragments');
console.log('Dinner word search: seven disjoint unique straight/connected paths, boundary guards, ordered leftovers and saved word/hint/decoded progress');
assert.equal(DINNER_CLUES.find(c=>c.id==='bowls').scene,'PaninisFlat');
assert.ok(DINNER_CLUES.find(c=>c.id==='skyline').radius>38,'bench can be reached from multiple sides');
assert.equal(new Set(DINNER_CLUES.map(c=>c.scene)).size,3,'one keepsake in each of three different scenes');
assert.ok(DINNER_CLUES.every(c=>c.scene!=='Apartment'),'nothing to collect in the ending room');
for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]){
 let state=new GameState();state.markIntroSeen();state.setFlag('cakeGiven');
 assert.match(currentObjective(state,'Apartment').text,/Ask Michell/,'cake alone does not start the search');
 state.setFlag('dinnerStarted');
 for(let n=0;n<3;n++){
  state.setFlag(DINNER_CLUES[order[n]].flag);state.setFlag(DINNER_CLUES[order[n]].flag);
  assert.equal(dinnerCluesFound(state),n+1,'duplicate collection cannot inflate the count');
  state=GameState.fromJSON(state.toJSON());assert.equal(dinnerCluesFound(state),n+1);
  assert.equal(state.flag('dinnerRevealed'),false,'keepsakes do not reveal dinner by themselves');
 }
 assert.match(currentObjective(state,'Street').text,/Meet the pigeon/);
 state.setFlag('dinnerNoteDropped');state=GameState.fromJSON(state.toJSON());
 assert.match(currentObjective(state,'Street').text,/Pick up.*note/,'reloading after the drop keeps a readable note');
 assert.match(currentObjective(state,'Street').text,/outdoor café tables/,'landmark guidance stays specific after all three keepsakes');
 state.setFlag('dinnerRevealed');assert.equal(currentObjective(state,'Street'),null);
 assert.equal(dinnerCluesFound(new GameState()),0);
}
console.log('Dinner: scattered scenes, assignment gate, six orders, duplicate collection, save round trips, note recovery and reset');

const legacy=GameState.fromJSON({version:1,introSeen:true,ingredients:['flour'],flags:['cakeGiven','bakeDone','dinnerPlush','dinnerBowls','dinnerSkyline','dinnerRevealed']});
assert.equal(legacy.flag('cakeGiven'),true);assert.equal(legacy.hasIngredient('flour'),true);assert.equal(dinnerCluesFound(legacy),0);assert.equal(legacy.flag('dinnerRevealed'),false);assert.match(currentObjective(legacy,'Apartment').text,/Ask Michell/);assert.equal(legacy.toJSON().version,2);
console.log('Dinner: version-1 clue inspections retire without resetting cake or neighbourhood progress');

const {previewState}=load('src/systems/playtest.ts');
const finished=new GameState();finished.markIntroSeen();finished.setFlag('cakeGiven');finished.setFlag('dinnerRevealed');finished.bump('propSeen:fern');
finished.setFlag('dinnerWord:FLOUR');finished.setFlag('dinnerDecoded');finished.bump('dinnerHint:CAKE',2);
const ending=previewState(finished,'ending'),hunt=previewState(finished,'dinner');
assert.equal(ending.flag('cakeGiven'),false);assert.equal(ending.flag('bakeDone'),false);
assert.equal(hunt.flag('cakeGiven'),true);assert.equal(hunt.flag('bakeDone'),true);
for(const checkpoint of [ending,hunt]){
 assert.equal(checkpoint.count('propSeen:fern'),1);assert.equal(checkpoint.hasIngredient('butter'),true);assert.equal(checkpoint.marketSugarCubeCount(),3);
 assert.equal(checkpoint.flag('dinnerStarted'),false);assert.equal(checkpoint.flag('dinnerRevealed'),false);assert.equal(dinnerCluesFound(checkpoint),0);
 assert.equal(checkpoint.flag('dinnerWord:FLOUR'),false);assert.equal(checkpoint.flag('dinnerDecoded'),false);assert.equal(checkpoint.count('dinnerHint:CAKE'),0);
}
assert.equal(finished.flag('dinnerRevealed'),true,'checkpoint does not mutate its source');
hunt.setFlag('dinnerStarted');assert.match(currentObjective(hunt,'Market').text,/Explore/);assert.equal(currentObjective(hunt,'Street').doorTarget,undefined,'exploration must not identify a route');
const {DINNER_ASSIGNMENT,dinnerReminder}=load('src/data/dinner.ts');
for(const line of [...DINNER_ASSIGNMENT,...dinnerReminder(hunt,'Michell')])assert.doesNotMatch(line.text,/blue plush|tea cups|tiny bridge|pond|market stalls|bakery/i,'invitation must not list answers');
console.log('Replay checkpoints preserve notebook and reset ending/hunt independently; exploratory guidance does not disclose objects/locations');
