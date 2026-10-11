// Finish portable pack URLs, then precache exactly the runtime resources (not source art).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = path.resolve(process.argv[2] ?? 'dist');
const hash = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 16);
const packs = readdirSync(path.join(root, 'assets')).filter(name => name.endsWith('asset-pack.json'));
const versions = packs.map(name => [`assets/${name}`, hash(readFileSync(path.join(root, 'assets', name)))]);
for (const name of readdirSync(path.join(root, 'assets')).filter(name => name.endsWith('.js'))) {
  const file = path.join(root, 'assets', name);
  let source = readFileSync(file, 'utf8');
  for (const [url, version] of versions) source = source.replaceAll(`"${url}"`, `"${url}?h=${version}"`);
  writeFileSync(file, source);
}
const urls = new Set(['index.html', 'credits.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png']);
for (const name of ['style.css', 'favicon.png']) if (existsSync(path.join(root, name))) urls.add(name);
function collect(value) {
  if (typeof value === 'string' && !/^(https?:|data:)/.test(value) && existsSync(path.join(root, value.split('?')[0]))) urls.add(value);
  else if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
}
for (const [url, version] of versions) { urls.add(`${url}?h=${version}`); collect(JSON.parse(readFileSync(path.join(root, url), 'utf8'))); }
for (const name of readdirSync(path.join(root, 'assets'))) if (/\.(js|css)$/.test(name)) urls.add(`assets/${name}`);
for (const dir of ['assets/fonts', 'assets/audio/music', 'assets/audio/sfx']) {
  if (existsSync(path.join(root, dir))) for (const name of readdirSync(path.join(root, dir))) if (/\.(woff2?|ogg|m4a)$/.test(name)) urls.add(`${dir}/${name}`);
}
const list = [...urls].sort();
const revision = hash(list.map(url => `${url}:${hash(readFileSync(path.join(root, url.split('?')[0])))}`).join('\n'));
const worker = path.join(root, 'sw.js');
writeFileSync(worker, readFileSync(worker, 'utf8').replace('__BUILD_CACHE__', `frankie-${revision}`).replace('const SHELL = [];', `const SHELL = ${JSON.stringify(list)};`));
console.log(`Versioned ${packs.length} packs; precached ${list.length} runtime resources (${revision}).`);
