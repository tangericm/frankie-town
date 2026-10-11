# Frankie Town public code

This repository contains game code. Artwork, audio, fonts, generation prompts, source references, personal notes and development history remain private. Do not add those files or download them automatically.

Use Node 22.12+ and npm ci. npm run verify checks types, code regression tests and JavaScript bundling without game assets. npm run build requires a separately supplied authorized private asset bundle; the live game is linked from README.md.

Preserve keyboard, pointer and touch controls, browser save compatibility, reduced-motion settings and modal input locks. Run the relevant tests before committing a change. Room scenes are generated in the private development project; edit their builders there and bring across the resulting source changes.
