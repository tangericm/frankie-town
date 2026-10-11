import { existsSync } from "node:fs";

if (!existsSync("public/assets/asset-pack.json")) {
  console.error("Game assets are private and are not included in this repository. Supply your own authorized asset bundle under public/assets/ before building the playable game. See README.md.");
  process.exit(1);
}
