# Frankie Town

The TypeScript source behind a cozy pixel-art dog adventure: explore a neighborhood, solve small puzzles and bring home the ingredients for a cake.

**[Play the game](https://frankie-town.vercel.app)** · [Eric M. Tang](https://ericmtang.com)

Built with **Phaser 4, TypeScript and Vite**. Includes keyboard, mouse and touch movement, dialogue, pathfinding, minigames, browser saves, adjustable text and motion, and production offline caching.

## Public code, private assets

This is a **code-only source edition**. Artwork, audio, fonts, asset packs, generation prompts, reference photographs, personal development notes and original Git history are excluded. Game character names and dialogue already visible in the playable game remain in its source.

The hosted game serves the runtime files a browser needs to play; those files are necessarily downloadable by visitors. Their presence in the playable game does not grant reuse rights, and this repository does not redistribute or automatically download them.

## Check the code

Use **Node.js 22.12+** and npm (`nvm use` selects Node 22). No art-generation credentials or Python dependencies are needed for these checks:

```sh
npm ci
npm run verify
```

`verify` runs TypeScript checking, code regression tests and JavaScript bundling. GitHub Actions runs the same checks on Node 22. The resulting code bundle is not a standalone playable game without its asset bundle.

## Run or build a playable game

Supply an authorized private asset bundle in `public/assets/`, along with its `public/icons/` and `public/favicon.png` files. Assets use the Phaser asset-pack format; `src/scenes/Preload.ts` and the room scenes define the required texture keys. The original game assets are maintained separately and are ignored by Git in this repository.

```sh
npm start
npm run build
npm run preview
```

Development uses port 8080; preview uses 8081. Serve the whole production `dist/` directory. The production build hashes pack references and generates a content-derived offline cache. After a full asset-backed build, optional browser checks cover first-session offline reopening and retained-profile updates at root and subdirectory paths:

```sh
npx playwright install chromium
npm run test:production
```

Play the hosted game to explore it without supplying assets. Progress is browser-local; clearing browser storage removes it. New game asks before replacing a save. Settings provides text size, reduced motion, sound and zoom controls.

## Code map

- `src/scenes/`: scene shells and generated room source.
- `src/systems/`: movement, interactions, dialogue, puzzles, UI, saves and audio.
- `src/data/`: gameplay state, dialogue, objectives and quest wiring.
- `scripts/tests/`: asset-free code regressions and optional asset-backed offline tests.
- `scripts/finalize-build.mjs`, `public/sw.js`: portable production pack URLs and offline cache lifecycle.

Read [AGENTS.md](AGENTS.md) before editing. Preserve save compatibility and input/accessibility behavior; run relevant tests before submitting a change. Room layouts are generated in the private development project.

## Licence

Code is MIT licensed: [LICENSE](LICENSE). See [CREDITS.md](CREDITS.md). The code licence grants no rights to excluded game assets, third-party characters or trademarks.
