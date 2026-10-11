import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const root = mkdtempSync(path.join(tmpdir(), "frankie-assets-check-"));
const script = path.resolve("scripts/check-private-assets.mjs");
try {
  const missing = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Game assets are private/);
  mkdirSync(path.join(root, "public/assets"), { recursive: true });
  writeFileSync(path.join(root, "public/assets/asset-pack.json"), "{}");
  assert.equal(spawnSync(process.execPath, [script], { cwd: root }).status, 0);
  console.log("Private asset preflight gives setup guidance without downloading assets");
} finally {
  rmSync(root, { recursive: true, force: true });
}
