import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bakeryData = readFileSync("src/data/bakery.gameplay.ts", "utf8");
const attach = readFileSync("src/systems/attachGameplay.ts", "utf8");
const questData = readFileSync("src/data/quest.ts", "utf8");

// Break caught: without this, Teddy's flour handoff and Pierre's eggs/sugar errand are two
// disconnected side-quests -- nothing ever tells the player the Market/Pierre exist at all.
const handoverBlock = bakeryData.match(/export const TEDDY_HANDOVER_LINES: DialogueLine\[\] = \[([\s\S]*?)\];/)?.[1] ?? "";
assert.match(handoverBlock, /Pierre/, "handover must name Pierre");
assert.match(handoverBlock, /eggs/i, "handover must mention eggs");
assert.match(handoverBlock, /sugar/i, "handover must mention sugar");
assert.match(handoverBlock, /[Mm]arket/, "handover must point Frankie at the Market");

// Break caught: revealing eggs/sugar only when Pierre is later met (existing behavior) leaves the
// journal silent about them until the player happens to find the Market on their own. Revealing
// them right at the flour handoff, after addIngredient(flour), surfaces the next errand immediately.
assert.match(
	attach,
	/gameState\.addIngredient\(QUEST\.flourIngredientId\);[\s\S]{0,200}?gameState\.revealIngredient\(QUEST\.eggsIngredientId\);[\s\S]{0,80}?gameState\.revealIngredient\(QUEST\.sugarIngredientId\);/,
	"flour handoff must reveal the eggs and sugar journal rows immediately after granting flour",
);

// Break caught: attachGameplay.ts and MarketGameplay.ts must agree on the "eggs"/"sugar" ingredient
// ids without duplicating them as magic strings -- QUEST is the single shared source for the ids
// attachGameplay.ts uses.
assert.match(questData, /eggsIngredientId:\s*"eggs"/, "QUEST.eggsIngredientId must be \"eggs\"");
assert.match(questData, /sugarIngredientId:\s*"sugar"/, "QUEST.sugarIngredientId must be \"sugar\"");

// Break caught (MAJOR): Rafa's zone gated the ending on flour alone. Teddy's flour handoff is a
// third of the errand -- it also reveals eggs and sugar -- so walking home with just flour played
// "You got it! Every last thing" over a journal still showing two unchecked rows, set endingSeen,
// and left the written payoff unreachable: every later visit, market genuinely finished, got the
// short reminder line instead. The ending must require all three, with a middle branch to point at
// the market in between.
assert.match(
  attach,
  /hasEverything = has\(QUEST\.flourIngredientId\) && has\(QUEST\.eggsIngredientId\) && has\(QUEST\.sugarIngredientId\) && has\(QUEST\.butterIngredientId\)/,
  "the ending must be gated on all four ingredients, not just flour",
);
// With everything in hand the zone runs the ending proper (src/systems/ending.ts), and the
// ending is marked seen only inside that branch; with flour but not eggs/sugar Rafa points at the
// market rather than replaying either end of the quest.
assert.match(
  attach,
  /if \(hasEverything && !gameState\.flag\("cakeGiven"\)\) \{[\s\S]{0,700}?ENDING_DIALOGUE[\s\S]{0,300}?gameState\.markEndingSeen\(\);[\s\S]{0,80}?startEnding\(\);/,
  "the ending must play (and only then be marked seen) when all four ingredients are held",
);
assert.match(
  attach,
  /const lines = hasEverything\s*\?\s*RAFA_AFTER_LINES[\s\S]*?:\s*has\(QUEST\.flourIngredientId\)\s*\?\s*RAFA_MARKET_REMINDER_LINES/,
  "with flour but not eggs/sugar, Rafa must point at the market rather than replay either end of the quest",
);
assert.equal((attach.match(/markEndingSeen\(\)/g) ?? []).length, 1, "the ending is marked seen in exactly one place");
{
  const apartmentData = readFileSync("src/data/apartment.gameplay.ts", "utf8");
  const midQuest = apartmentData.match(/RAFA_MARKET_REMINDER_LINES: DialogueLine\[\] = \[([\s\S]*?)\];/)?.[1] ?? "";
  assert.match(midQuest, /eggs/i, "the mid-quest reminder must name what is still missing");
  assert.match(midQuest, /sugar/i);
  assert.match(midQuest, /Pierre|market/i, "the mid-quest reminder must say where to go");
}

// Break caught (MAJOR): every arrival spawn sat ~20px from the door it came out of, and `facing` is
// a scene-instance field that survives scene.start() still pointing at that door -- so the first
// frame of forward input walked straight back into the room just left. Both halves are asserted:
// the spawn's clearance, and that every branch resets facing via faceAndSpawn.
{
  const streetData = readFileSync("src/data/street.gameplay.ts", "utf8");
  const apartmentData = readFileSync("src/data/apartment.gameplay.ts", "utf8");
  const point = (source, name) => {
    const literal = source.match(new RegExp(`${name}(?::\\s*\\w+)? = \\{([^}]*)\\}`))[1];
    return { x: Number(literal.match(/x:\s*(-?\d+)/)[1]), y: Number(literal.match(/y:\s*(-?\d+)/)[1]) };
  };
  const pairs = [
    ["APARTMENT_DOOR", "APARTMENT_SPAWN_FROM_STREET", apartmentData],
    ["STREET_DOOR_TO_BAKERY", "STREET_SPAWN_FROM_BAKERY", streetData],
    ["STREET_DOOR_TO_APARTMENT", "STREET_SPAWN_FROM_APARTMENT", streetData],
    ["STREET_DOOR_TO_MARKET", "STREET_SPAWN_FROM_MARKET", streetData],
  ];
  for (const [doorName, spawnName, source] of pairs) {
    const door = point(source, doorName);
    const spawn = point(source, spawnName);
    const gap = Math.hypot(door.x - spawn.x, door.y - spawn.y);
    assert.ok(gap >= 40, `${spawnName} must be a deliberate walk (>=40px) from ${doorName}, not ${gap.toFixed(1)}px`);
  }
  for (const spawnName of pairs.map(([, spawn]) => spawn)) {
    assert.match(
      attach,
      new RegExp(`faceAndSpawn\\(${spawnName}\\.x, ${spawnName}\\.y, "(north|south|east|west)"\\)`),
      `${spawnName} must be applied with faceAndSpawn so Frankie is not left facing the door he just used`,
    );
  }
}

console.log("quest-handoff.test.mjs: all assertions passed");

// Break caught: every door in the game sits on a horizontal wall, but the trigger was pure distance
// -- walking along that wall sideways past the door's radius teleported Frankie out of the room
// ("you can sometimes enter and exit areas by walking sideways"). Each door must declare which way
// he has to be facing, and it must be the axis he actually approaches it on.
{
  const streetData = readFileSync("src/data/street.gameplay.ts", "utf8");
  const apartmentData = readFileSync("src/data/apartment.gameplay.ts", "utf8");
  const marketData = readFileSync("src/data/market.gameplay.ts", "utf8");
  const doors = [
    ["APARTMENT_DOOR", apartmentData, "south"],
    ["BAKERY_DOOR", bakeryData, "south"],
    ["STREET_DOOR_TO_BAKERY", streetData, "north"],
    ["STREET_DOOR_TO_APARTMENT", streetData, "north"],
    ["STREET_DOOR_TO_MARKET", streetData, "north"],
    ["STREET_DOOR_TO_PANINIS", streetData, "north"],
    ["MARKET_EXIT_TO_STREET", marketData, "south"],
  ];
  for (const [name, source, facing] of doors) {
    const block = source.match(new RegExp(`export const ${name}[^;]*;`, "s"))?.[0] ?? "";
    assert.match(block, new RegExp(`enterFacing:\\s*"${facing}"`), `${name} must only fire when walked into facing ${facing}`);
  }
  const transition = readFileSync("src/systems/SceneTransition.ts", "utf8");
  assert.match(transition, /door\.enterFacing && this\.getPlayerFacing\(\) !== door\.enterFacing\) continue/, "a facing mismatch must skip the door, not block it -- turning on the spot should still work");
}

// Break caught: two of the three Street arrival spawns landed 8px from their own radius-10 door AND
// on the facade collider's bottom edge, so Frankie materialised inside the wall, was shoved out by
// the physics step, and stood in the doorway he had just come through ("he kind of is shoved right
// at the door"). Only the re-arm gate stopped an immediate bounce straight back.
{
  const streetData = readFileSync("src/data/street.gameplay.ts", "utf8");
  const decl = (name) => streetData.match(new RegExp(`export const ${name}\\b[^\\n]*`))?.[0] ?? "";
  const num = (name, field) => Number(decl(name).match(new RegExp(`${field}:\\s*(-?\\d+)`))?.[1]);
  const pairs = [
    ["STREET_SPAWN_FROM_BAKERY", "STREET_DOOR_TO_BAKERY"],
    ["STREET_SPAWN_FROM_APARTMENT", "STREET_DOOR_TO_APARTMENT"],
    ["STREET_SPAWN_FROM_MARKET", "STREET_DOOR_TO_MARKET"],
  ];
  for (const [spawn, door] of pairs) {
    const gap = Math.hypot(num(spawn, "x") - num(door, "x"), num(spawn, "y") - num(door, "y"));
    const radius = num(door, "radius");
    assert.ok(gap > radius + 8, `${spawn} must arrive clear of ${door}'s own trigger (gap ${gap}, radius ${radius})`);
  }
}
