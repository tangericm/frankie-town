// Built distribution, empty profile -> offline; retained profile -> a changed pack release.
// Runs under both root and a subdirectory. npm run build first; no deployment needed.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
const dist=path.resolve('dist'), next=mkdtempSync(path.join(tmpdir(),'frankie-release-b-'));
const shell=JSON.parse(readFileSync(path.join(dist,'sw.js'),'utf8').match(/const SHELL = (\[[^;]+\]);/)[1]);
for(const url of shell){const f=url.split('?')[0];mkdirSync(path.dirname(path.join(next,f)),{recursive:true});copyFileSync(path.join(dist,f),path.join(next,f));}
writeFileSync(path.join(next,'sw.js'),readFileSync('public/sw.js'));
const pack=path.join(next,'assets/asset-pack.json'), data=JSON.parse(readFileSync(pack));data.meta.auditRelease='B';writeFileSync(pack,JSON.stringify(data));
for(const url of shell.filter(url=>url.endsWith('.js'))){const f=path.join(next,url);writeFileSync(f,readFileSync(f,'utf8').replace(/"(assets\/[^"]*asset-pack.json)\?h=[a-f0-9]+"/g,'"$1"'));}
execFileSync(process.execPath,['scripts/finalize-build.mjs',next]);
const identity=root=>readFileSync(path.join(root,'sw.js'),'utf8').match(/const CACHE = "([^"]+)"/)[1];
assert.notEqual(identity(dist),identity(next));let release=dist;
const types={'.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.css':'text/css','.html':'text/html','.png':'image/png','.xml':'application/xml','.woff2':'font/woff2','.ogg':'audio/ogg','.m4a':'audio/mp4'};
const server=createServer((req,res)=>{try{let name=new URL(req.url,'http://local').pathname.replace(/^\/game(?=\/)/,'').replace(/^\//,'')||'index.html';if(name.endsWith('/'))name+='index.html';const file=path.resolve(release,decodeURIComponent(name));if(!file.startsWith(release+path.sep))throw Error('invalid path');res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Cache-Control':'no-cache'});res.end(readFileSync(file));}catch{res.writeHead(404);res.end('missing')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();const results=[];
try{
 for(const prefix of ['/', '/game/']){
  release=dist;const context=await browser.newContext();const page=await context.newPage();const errors=[];const failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));
  await page.goto(origin+prefix);await page.waitForSelector('canvas');await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.waitForTimeout(1000);
  const keys=await page.evaluate(async name=>(await(await caches.open(name)).keys()).map(r=>new URL(r.url).pathname),identity(dist));
  for(const suffix of ['style.css','assets/fonts/Nunito.woff2','assets/props/dinner/azumarill.png'])assert.ok(keys.includes(prefix+suffix),'first install caches '+prefix+suffix);
  assert.ok(keys.some(k=>k.startsWith(prefix+'assets/index-')&&k.endsWith('.js')),'first install caches application JS');
  await (await context.newCDPSession(page)).send('Network.clearBrowserCache');await context.setOffline(true);await page.reload();await page.waitForSelector('canvas');await page.waitForTimeout(1600);
  assert.equal(await page.locator('#crash-overlay').count(),0);assert.deepEqual(errors,[]);assert.deepEqual(failed,[],'first ready session reopens offline without relying on HTTP cache');
  await context.setOffline(false);release=next;
  // A controlled page reloads when the new worker claims it; await that navigation before reading its cache.
  await Promise.all([page.waitForEvent('load'),page.evaluate(()=>{navigator.serviceWorker.getRegistration().then(r=>r.update());})]);
  await page.waitForFunction(async name=>(await caches.keys()).includes(name),identity(next));await page.waitForTimeout(1400);
  const versions=await page.evaluate(async name=>(await(await caches.open(name)).keys()).map(r=>r.url),identity(next));const packUrl=versions.find(url=>new URL(url).pathname.endsWith('/assets/asset-pack.json'));
  assert.ok(new URL(packUrl).searchParams.has('h'));
  const contents=await page.evaluate(url=>fetch(url).then(r=>r.json()),packUrl);assert.equal(contents.meta.auditRelease,'B','retained profile serves the new pack');
  assert.equal(await page.evaluate(async name=>(await caches.keys()).includes(name),identity(dist)),false,'old release cache retires');
  await context.setOffline(true);await page.reload();await page.waitForSelector('canvas');await page.waitForTimeout(800);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  results.push({prefix,firstOffline:true,retainedRelease:true,resources:keys.length});await context.close();
 }
 console.log(JSON.stringify(results,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));rmSync(next,{recursive:true,force:true});}
