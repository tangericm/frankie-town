// Loader cancellation/partial completion must leave missing audio retryable.
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const module={exports:{}};
runInNewContext(ts.transpileModule(readFileSync('src/systems/audio.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,require:()=>({default:{Loader:{Events:{COMPLETE:'complete'}},Scenes:{Events:{SHUTDOWN:'shutdown'}}}})});
const audio=Object.create(module.exports.AudioManager.prototype);const cached=new Set();
Object.assign(audio,{game:{cache:{audio:{exists:k=>cached.has(k)}}},loading:new Set(),playWanted(){}});
function scene(){const queued=[];const load=new EventEmitter();load.audio=k=>queued.push(k);load.start=()=>{};return{scene:{key:'Apartment'},events:new EventEmitter(),load,queued};}
const a=scene();audio.attach(a);assert.equal(a.queued.length,22);a.events.emit('shutdown');assert.equal(audio.loading.size,0);assert.equal(a.load.listenerCount('complete'),0);
const b=scene();audio.attach(b);assert.equal(b.queued.length,22);for(const k of b.queued)if(k!=='sfx-pickup')cached.add(k);b.load.emit('complete');
const c=scene();audio.attach(c);assert.deepEqual(c.queued,['sfx-pickup']);c.events.emit('shutdown');
console.log('Audit: abandoned and partially failed audio loaders retry missing files');

// Portable forward-slash pack references and a complete first-install offline shell.
const root=mkdtempSync(path.join(tmpdir(),'frankie-release-'));
try{
 for(const d of ['assets/fonts','assets/audio/music','assets/audio/sfx','icons'])mkdirSync(path.join(root,d),{recursive:true});
 for(const f of ['index.html','credits.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/icon-512-maskable.png','assets/prop.png','assets/fonts/body.woff2','assets/audio/music/home-town.ogg','assets/audio/sfx/pickup.m4a','assets/style-abcdefgh.css'])writeFileSync(path.join(root,f),f);
 writeFileSync(path.join(root,'assets/asset-pack.json'),JSON.stringify({files:[{url:'assets/prop.png?h=one'}]}));
 function finalize(){writeFileSync(path.join(root,'sw.js'),readFileSync('public/sw.js'));writeFileSync(path.join(root,'assets/index-abcdefgh.js'),'load("assets/asset-pack.json")');execFileSync(process.execPath,['scripts/finalize-build.mjs',root]);return readFileSync(path.join(root,'sw.js'),'utf8');}
 const first=finalize();assert.match(readFileSync(path.join(root,'assets/index-abcdefgh.js'),'utf8'),/assets\/asset-pack.json\?h=[a-f0-9]{16}/);
 for(const f of ['credits.html','assets/index-abcdefgh.js','assets/style-abcdefgh.css','assets/fonts/body.woff2','assets/audio/music/home-town.ogg','assets/audio/sfx/pickup.m4a','assets/prop.png?h=one'])assert.ok(first.includes(f),`precache includes ${f}`);
 writeFileSync(path.join(root,'assets/prop.png'),'release two');assert.notEqual(finalize().match(/const CACHE = "([^"]+)"/)[1],first.match(/const CACHE = "([^"]+)"/)[1]);
 console.log('Audit: portable pack URLs, JS/CSS/fonts/audio precache, content-derived release identity');
}finally{rmSync(root,{recursive:true,force:true});}

// A scale-only panel entrance must not overwrite a position supplied by a resize.
{
 const m={exports:{}};runInNewContext(ts.transpileModule(readFileSync('src/systems/motion.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:()=>({reducedMotion:()=>false})});
 let tween;const target={x:0,y:20,setScale(){return this},setAlpha(){return this},setY(y){this.y=y;return this}};const scene={tweens:{killTweensOf(){},add(config){tween=config}}};
 m.exports.openPanel(scene,target,{scale:.92,alpha:0});assert.equal(Object.hasOwn(tween,'y'),false);
 m.exports.openPanel(scene,target,{y:24});assert.equal(tween.y,20);
 console.log('Audit: panel entrance leaves resized positions alone unless a slide was requested');
}
