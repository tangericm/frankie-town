import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
const root = mkdtempSync(path.join(tmpdir(), 'game-publication-'));
function file(name, contents = 'fixture') {
  mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  writeFileSync(path.join(root, name), contents);
}
try {
  for (const name of ['index.html', 'credits.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png', 'assets/index.js', 'assets/player.png', 'assets/player.json', 'assets/fonts/display.woff2', 'assets/title/title-hero.png', 'assets/fonts/display-OFL.txt']) file(name);
  file('assets/asset-pack.json', JSON.stringify({ main: { files: [{ url: 'assets/player.png', atlasURL: 'assets/player.json' }] } }));
  file('sw.js', 'const CACHE = "__BUILD_CACHE__"; const SHELL = [];');
  const privateFiles = ['assets/characters/player/metadata.json', 'assets/scenes/room/src/project.godot', 'assets/props/README.md', 'assets/reference-photo.png', 'assets/index.js.map'];
  privateFiles.forEach(name => file(name));
  execFileSync(process.execPath, ['scripts/finalize-build.mjs', root]);
  for (const name of privateFiles) assert.equal(existsSync(path.join(root, name)), false, name + ' must not ship');
  for (const name of ['index.html', 'sw.js', 'assets/player.png', 'assets/player.json', 'assets/fonts/display.woff2', 'assets/index.js', 'assets/title/title-hero.png', 'assets/fonts/display-OFL.txt']) assert.ok(existsSync(path.join(root, name)), name + ' remains playable');
  console.log('Runtime publication excludes source metadata, prompts, references and source maps.');
} finally { rmSync(root, { recursive: true, force: true }); }
