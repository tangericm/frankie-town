import Phaser from "phaser";
import { DINNER_DESTINATION } from "../data/dinner";
import { DINNER_GRID, DINNER_COLUMNS, DINNER_WORDS, dinnerWordPath, dinnerWordAt, dinnerLeftovers } from "../data/dinnerPuzzle";
import { getGameState } from "./GameState";
import { PALETTE } from "./palette";
import { drawPanel, makeButton } from "./panel";
import { closePanel, MOTION } from "./motion";
import { reducedMotion } from "./juice";
import { getAudio } from "./audio";
import { getTextScale, TEXT_SCALE_CHANGED } from "./textScale";

/** The existing physical letter, with a journey-clued word search and optional whole-name entry. */
export function showDinnerLetter(scene: Phaser.Scene, from: { x: number; y: number }, hide: (o: Phaser.GameObjects.GameObject) => void, done: (decoded: boolean) => void) {
 const still = reducedMotion(scene), state = getGameState(scene);
 // Preserve the old cup clue's progress when opening its replacement board.
 if (state.flag("dinnerWord:TEA")) state.setFlag("dinnerWord:TEACUP");
 const oldHint = state.count("dinnerHint:TEA"), cupHint = state.count("dinnerHint:TEACUP");
 if (oldHint > cupHint) state.bump("dinnerHint:TEACUP", oldHint - cupHint);
 let ready = false, closing = false, decoded = false, selected = Math.max(0, DINNER_WORDS.findIndex(entry => !state.flag("dinnerWord:" + entry.word as `dinnerWord:${string}`))), focusCell = 0;
 let anchor: number | null = null, hover: number | null = null, dragStart: number | null = null;
 let view: "search" | "help" | "guess" = "search", helpFocus = -1, message = "", scrollY = 0, maxScroll = 0, paperW = 358, paperH = 600, cellSize = 48;
 const extraction = { value: 0 };
 const opening = { value: 0 };
 let clearing = false;
 let guessInput: HTMLInputElement | null = null;
 let guessDraft = Array.from({ length: 6 }, (_, i) => state.count(`dinnerLetter:${i}`)).map(value => value >= 1 && value <= 26 ? String.fromCharCode(value + 64) : "").join("");
 const saveDraft = (value: string) => {
  guessDraft = value;
  for (let i = 0; i < 6; i++) { const key = `dinnerLetter:${i}` as const, next = value[i] ? value.charCodeAt(i) - 64 : 0; if (state.count(key) !== next) state.bump(key, next - state.count(key)); }
 };
 const layer = scene.add.container(0, 0).setScrollFactor(0).setDepth(24000).setName("dinner-letter"); hide(layer);
 const dim = scene.add.rectangle(0, 0, 1, 1, PALETTE.shadow, 0.68).setInteractive();
 const art = scene.add.container(0, 0), paper = scene.add.container(0, 0).setName("dinner-letter-paper");
 const sheet = scene.add.graphics().setName("dinner-letter-sheet"), content = scene.add.container(0, 0).setName("dinner-letter-content");
 const text = (name: string, value: string) => scene.add.text(0, 0, value, { fontFamily: "Nunito, sans-serif", color: PALETTE.css.text, resolution: 3, padding: { x: 2, y: 2 } }).setName(name);
 const title = text("dinner-letter-title", "Pigeon post").setFontStyle("bold");
 const instruction = text("dinner-letter-instructions", "Find memories right or down.\nTap both ends, or drag along a word.");
 const memory = text("dinner-letter-memory", "").setFontStyle("bold").setColor(PALETTE.css.textMuted);
 const clue = text("dinner-letter-clue", "");
 const status = text("dinner-letter-status", "").setColor(PALETTE.css.textMuted);
 const signature = text("dinner-letter-signature", "With love,\nyour very particular pigeon").setColor(PALETTE.css.textMuted);
 const ink = text("dinner-letter-destination", DINNER_DESTINATION).setFontStyle("bold");
 const grid = scene.add.container(0, 0).setName("dinner-word-grid");
 const found = (): string[] => DINNER_WORDS.filter(entry => state.flag("dinnerWord:" + entry.word as `dinnerWord:${string}`)).map(entry => entry.word);
 const allFound = () => found().length === DINNER_WORDS.length;
 const button = (name: string, label: string, width: number, action: () => void, fontSize = 14) => makeButton(scene, 0, 0, label, () => { if (ready && !closing) action(); }, { width, height: 44, font: "body", fontSize, disabled: true }).setName(name);
 const prev = button("dinner-word-prev", "Prev", 48, () => selectMemory(selected - 1));
 const next = button("dinner-word-next", "Next", 48, () => selectMemory(selected + 1));
 const hint = button("dinner-word-hint", "Hint", 70, () => {
  const entry = DINNER_WORDS[selected], key = "dinnerHint:" + entry.word as `dinnerHint:${string}`;
  const step = Math.min(3, state.bump(key));
  if (step === 3) findWord(entry.word); else { anchor = hover = null; message = step === 1 ? "Look for " + entry.word + "." : "Starts at row " + (Math.floor(entry.start / 6) + 1) + ", column " + (entry.start % 6 + 1) + "."; refresh(); layout(); }
 });
 const guess = button("dinner-word-guess", "Dinner: _ _ _ _ _ _", 218, () => changeView("guess"), 16);
 const read = button("dinner-word-read", "Read note", 132, () => { if (allFound()) solve(); }); read.setSelected(true);
 const backToSearch = button("dinner-letter-back", "Back to search", 156, () => changeView("search"));
 const reveal = button("dinner-letter-reveal", "Reveal dinner plan", 208, () => solve());
 const check = button("dinner-letter-check", "Address letter", 164, () => {
  if (guessInput?.value.trim().toUpperCase() === DINNER_DESTINATION.toUpperCase()) solve();
  else { message = "Not quite. The memories can help."; refresh(); layout(); }
 });
 const guessSlot = scene.add.rectangle(0, 0, 1, 44, PALETTE.panel).setOrigin(0).setName("dinner-letter-guess-slot");
 const cells = Array.from({ length: DINNER_GRID.length * DINNER_COLUMNS }, (_, i) => {
  const bg = scene.add.graphics(), glyph = text("dinner-word-letter-" + i, DINNER_GRID[Math.floor(i / DINNER_COLUMNS)][i % DINNER_COLUMNS]).setOrigin(0.5).setFontStyle("bold");
  const hit = scene.add.rectangle(0, 0, 44, 44, 0, 0).setOrigin(0).setInteractive({ useHandCursor: true });
  const tile = scene.add.container(0, 0, [bg, glyph, hit]).setName("dinner-word-cell-" + i);
  hit.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
   if (!ready || closing || decoded || allFound() || view !== "search" || cellAt(pointer) !== i) return;
   if (anchor === null) anchor = i;
   hover = focusCell = i; dragStart = i; drawCells();
  });
  return { tile, bg, glyph, hit };
 });
 grid.add(cells.map(c => c.tile));
 content.add([title, instruction, memory, clue, status, grid, prev, next, hint, guess, backToSearch, reveal, check, guessSlot, signature, ink]);
 paper.add([sheet, content]);
 const envelope = scene.add.container(0, 0).setName("dinner-letter-envelope");
 const back = scene.add.graphics(); drawPanel(back, 256, 128); back.setPosition(-128, -64);
 const flap = scene.add.graphics().setPosition(0, -62).setName("dinner-letter-flap");
 flap.fillStyle(PALETTE.panelLight).fillTriangle(-124, 0, 124, 0, 0, 72).lineStyle(2, PALETTE.border).lineBetween(-124, 0, 0, 72).lineBetween(0, 72, 124, 0);
 const front = scene.add.graphics();
 front.fillStyle(PALETTE.panel).fillTriangle(-126, -61, -126, 62, 4, 14).fillTriangle(126, -61, 126, 62, -4, 14).fillTriangle(-126, 62, 126, 62, 0, -6);
 front.lineStyle(1, PALETTE.borderLight).lineBetween(-124, 60, 0, -4).lineBetween(0, -4, 124, 60);
 const seal = scene.add.container(0, 13, [scene.add.circle(0, 0, 12, PALETTE.accentDark).setStrokeStyle(2, PALETTE.border), scene.add.circle(-1, -1, 8, PALETTE.accent).setStrokeStyle(1, PALETTE.borderLight), text("dinner-letter-seal", "F").setFontSize(12).setOrigin(0.5).setColor(PALETTE.css.panelLight)]);
 const address = text("dinner-letter-address", "For Michell").setFontSize(15).setOrigin(0.5).setPosition(0, 39);
 envelope.add([back, front, flap, seal, address]); art.add([paper, envelope]);
 const clip = scene.add.graphics().setScrollFactor(0), contentClip = scene.add.graphics().setScrollFactor(0);
 scene.children.remove(clip); scene.children.remove(contentClip);
 paper.enableFilters(); if (paper.filters) paper.filters.external.addMask(clip); else paper.setMask(clip.createGeometryMask());
 content.enableFilters(); if (content.filters) content.filters.external.addMask(contentClip); else content.setMask(contentClip.createGeometryMask());
 const mask = () => {
  const padding = ready ? 4 : 0;
  const matrix = paper.getWorldTransformMatrix(), top = matrix.transformPoint(-paperW / 2 - padding, -paperH / 2 - padding), bottom = matrix.transformPoint(paperW / 2 + 4, paperH / 2 + 4);
  const envelopeEdge = art.getWorldTransformMatrix().transformPoint(0, envelope.y - 62);
  clip.clear().fillStyle(0xffffff).fillRect(top.x, top.y, Math.max(1, bottom.x - top.x), Math.max(0, Math.min(bottom.y, ready ? bottom.y : envelopeEdge.y) - top.y));
  const inner = matrix.transformPoint(-paperW / 2 + 14, -paperH / 2 + 14);
  contentClip.clear().fillStyle(0xffffff).fillRect(inner.x, inner.y, paperW - 28, paperH - 28);
 };
 const slidePaper = () => {
  // The sheet starts at the envelope mouth; both motions share one progress value.
  paper.setY((paperH / 2 - 62) * (1 - opening.value));
  envelope.setY((paperH / 2 + 62) * opening.value);
  if (flap.parentContainer === art) flap.setY(envelope.y - 62);
  mask();
 };
 const close = (keepNote = false) => {
  if (!ready || closing) return; closing = true; layer.setData("phase", "closing"); guessInput?.remove(); guessInput = null;
  scene.tweens.killTweensOf(extraction);
  closePanel(scene, layer, () => { cleanup(); layer.destroy(); done(keepNote && decoded); });
 };
 const keep = button("dinner-letter-close", "Keep note", 144, () => close(true));
 const later = button("dinner-letter-later", "Later", 86, () => close());
 const help = button("dinner-letter-help", "Help", 74, () => changeView(view === "help" ? "search" : "help"));
 const scroll = button("dinner-letter-scroll", "More ↓", 80, () => { guessInput?.blur(); scrollY = scrollY >= maxScroll ? 0 : Math.min(maxScroll, scrollY + Math.max(120, paperH * 0.65)); layout(); });
 layer.add([dim, art, later, help, scroll, read, keep]); layer.setScrollFactor(0, 0, true);
 const drawCells = () => {
  const entries = found(), remaining = dinnerLeftovers(entries), complete = allFound();
  const covered = new Set(entries.flatMap(word => { const entry = DINNER_WORDS.find(e => e.word === word)!; return dinnerWordPath(entry.start, entry.end); }));
  const gathered = complete && extraction.value === 1 && !clearing;
  const selection = new Set(anchor === null || hover === null ? [] : dinnerWordPath(anchor, hover));
  const entry = DINNER_WORDS[selected], hinted = state.count("dinnerHint:" + entry.word as `dinnerHint:${string}`) >= 2;
  cells.forEach(({ tile, bg, glyph, hit }, i) => {
   const x = (i % DINNER_COLUMNS) * cellSize, y = Math.floor(i / DINNER_COLUMNS) * cellSize, rank = remaining.indexOf(i), used = covered.has(i);
   tile.setPosition(gathered && rank >= 0 ? rank * cellSize : x, gathered && rank >= 0 ? 0 : y);
   tile.setAlpha(complete && used ? 1 - extraction.value : 1);
   bg.clear().fillStyle(covered.has(i) ? PALETTE.panel : PALETTE.panelLight).fillRect(1, 1, cellSize - 2, cellSize - 2);
   const marked = selection.has(i) || (hinted && i === entry.start && !found().includes(entry.word));
   bg.lineStyle(marked ? 2 : 1, marked ? PALETTE.accentDark : PALETTE.borderLight).strokeRect(1, 1, cellSize - 2, cellSize - 2);
   // Each found word consumes its own cells; none can be needed by another answer.
   if (used) bg.lineStyle(1, PALETTE.textMuted, 0.7).lineBetween(8, cellSize / 2 + 1, cellSize - 8, cellSize / 2 + 1);
   if (complete && rank >= 0) bg.lineStyle(2, PALETTE.accentDark).strokeRect(1, 1, cellSize - 2, cellSize - 2);
   if (!complete && !scene.sys.game.device.input.touch && focusCell === i) bg.lineStyle(2, PALETTE.accentDark).strokeRect(4, 4, cellSize - 8, cellSize - 8);
   glyph.setFontSize(Math.min(cellSize - 16, Math.round(24 * getTextScale(scene.game)))).setPosition(cellSize / 2, cellSize / 2);
   const color = used ? PALETTE.css.textMuted : PALETTE.css.text;
   if (glyph.style.color !== color) glyph.setColor(color);
   hit.setSize(cellSize, cellSize).setPosition(0, 0);
   if (complete || used) hit.disableInteractive();
  });
 };
 const refresh = () => {
  const entries = found(), entry = DINNER_WORDS[selected];
  title.setText(decoded ? "Dinner" : view === "help" ? "A little help" : view === "guess" ? "Know the place?" : "Pigeon post");
  instruction.setText(decoded ? "For Michell" : view === "help" ? "Find seven memories, right or down. Words don't share letters. The six letters left make your dinner plan." : view === "guess" ? "You can address the letter whenever you recognise the place. Six letters." : allFound() ? "Six letters left. A dinner plan!" : "Right or down: drag or tap both ends.\nWords don't share letters.");
  memory.setText("Clue " + (selected + 1) + " / " + DINNER_WORDS.length + " · " + entry.keepsake);
  clue.setText(entries.includes(entry.word) ? "✓ " + entry.word + " — " + entry.clue : entry.clue);
  const hintStep = state.count("dinnerHint:" + entry.word as `dinnerHint:${string}`);
  status.setText(allFound() && view === "search" ? "All seven memories found." : message || (!entries.includes(entry.word) && hintStep >= 2 ? "Starts at row " + (Math.floor(entry.start / 6) + 1) + ", column " + (entry.start % 6 + 1) + "." : !entries.includes(entry.word) && hintStep >= 1 ? "Look for " + entry.word + "." : entries.length + " / " + DINNER_WORDS.length + " memories found"));
  guess.setLabel("Dinner: " + guessDraft.padEnd(6, "_").split("").join(" "));
  hint.setLabel(state.count("dinnerHint:" + entry.word as `dinnerHint:${string}`) >= 2 ? "Find it" : "Hint");
  hint.setDisabled(!ready || entries.includes(entry.word)); read.setDisabled(!ready || !allFound() || clearing || extraction.value < 1);
  read.setFocused(!scene.sys.game.device.input.touch && allFound() && !clearing);
  layer.setData("found", entries); layer.setData("leftovers", dinnerLeftovers(entries)); layer.setData("hints", state.count("dinnerHint:" + entry.word as `dinnerHint:${string}`)); layer.setData("draft", guessDraft); layer.setData("code", decoded ? DINNER_DESTINATION.toUpperCase() : ""); layer.setData("view", view);
  drawCells();
 };
 const selectMemory = (index: number) => { selected = (index + DINNER_WORDS.length) % DINNER_WORDS.length; message = ""; anchor = hover = null; refresh(); layout(); };
 const findWord = (word: string) => {
  const repeated = found().includes(word);
  state.setFlag("dinnerWord:" + word as `dinnerWord:${string}`);
  anchor = hover = null;
  message = repeated ? "Already found. Try another memory." : word + " — found!";
  if (!repeated) { getAudio(scene).sfx("journal-tick", { volume: 0.4 }); const nextEntry = DINNER_WORDS.findIndex(entry => !found().includes(entry.word)); if (nextEntry >= 0) selected = nextEntry; }
  if (allFound() && !repeated) beginExtraction(); else { refresh(); layout(); }
 };
 const commit = (end: number) => {
  if (anchor === null || anchor === end) return;
  const entry = dinnerWordAt(anchor, end);
  if (entry) findWord(entry.word);
  else { message = dinnerWordPath(anchor, end).length ? "Not one of our memories. Try another word." : "Words go straight right or down."; anchor = hover = null; refresh(); layout(); }
 };
 const changeView = (nextView: typeof view) => {
  view = nextView; helpFocus = -1; scrollY = 0; message = ""; anchor = hover = dragStart = null; guessInput?.remove(); guessInput = null;
  backToSearch.setFocused(false); reveal.setFocused(false);
  refresh(); layout();
  if (view === "guess") {
   const input = document.createElement("input"); guessInput = input;
   input.type = "text"; input.value = guessDraft; input.maxLength = 6; input.autocomplete = "off"; input.spellcheck = false; input.setAttribute("autocapitalize", "characters"); input.setAttribute("aria-label", "Dinner destination");
   input.style.cssText = "position:fixed;z-index:900;border:2px solid " + PALETTE.css.border + ";border-radius:6px;background:" + PALETTE.css.panelLight + ";color:" + PALETTE.css.text + ";font:bold 22px Nunito,sans-serif;text-align:center;box-sizing:border-box;letter-spacing:5px;";
   input.addEventListener("input", () => { input.value = input.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6); saveDraft(input.value); refresh(); });
   input.addEventListener("keydown", event => { event.stopPropagation(); if (event.key === "Enter") { event.preventDefault(); if (!event.repeat) check.activate(); } if (event.key === "Escape") { event.preventDefault(); changeView("search"); } });
   for (const name of ["pointerdown", "pointerup", "touchstart", "touchend"]) input.addEventListener(name, event => event.stopPropagation());
   document.body.append(input); layout(); input.focus({ preventScroll: true });
  }
 };
 const placeInput = () => {
  if (!guessInput) return;
  const bounds = guessSlot.getBounds(), canvas = scene.game.canvas.getBoundingClientRect(), sx = canvas.width / scene.scale.width, sy = canvas.height / scene.scale.height;
  guessInput.style.left = canvas.left + bounds.x * sx + "px"; guessInput.style.top = canvas.top + bounds.y * sy + "px";
  guessInput.style.width = bounds.width * sx + "px"; guessInput.style.height = bounds.height * sy + "px";
  const top = paper.getWorldTransformMatrix().transformPoint(0, -paperH / 2 + 14).y;
  const visible = ready && !closing && bounds.y >= top && bounds.bottom <= top + paperH - 28;
  guessInput.style.visibility = visible ? "visible" : "hidden"; guessInput.style.pointerEvents = visible ? "auto" : "none";
 };
 const layout = () => {
  const w = scene.scale.width, h = scene.scale.height, scale = getTextScale(scene.game);
  paperW = Math.min(w - 24, w > h ? 740 : 358); cellSize = Math.max(44, Math.min(48, Math.floor((paperW - 32) / DINNER_COLUMNS)));
  if (w > h && paperW < 600) cellSize = 44;
  const gathered = allFound() && extraction.value === 1 && !clearing;
  const innerW = paperW - 32, twoColumns = paperW >= 520 && !decoded && view === "search" && !allFound(), infoX = twoColumns ? cellSize * DINNER_COLUMNS + 18 : 0, column = twoColumns ? innerW - infoX : innerW, compact = h < 400;
  content.list.forEach(object => (object as Phaser.GameObjects.GameObject & { setVisible(v: boolean): void }).setVisible(false));
  const placeText = (object: Phaser.GameObjects.Text, y: number, size: number) => { object.setVisible(true).setFontSize(size * scale).setWordWrapWidth(column).setPosition(infoX, y); return y + object.height; };
  let y = placeText(title, 0, decoded ? (compact ? 20 : 26) : compact ? 20 : 24) + 4;
  if (compact && view === "search" && !decoded) instruction.setText(allFound() ? "Six letters left. A dinner plan!" : "Tap both ends, right or down.\nWords don't share letters.");
  y = placeText(instruction, y, compact ? 12 : 14) + 10;
  if (!decoded && view === "search") {
   if (!allFound()) {
    y = placeText(memory, y, compact ? 12 : 13) + 4; y = placeText(clue, y, compact ? 14 : 16) + 10;
    guess.setVisible(true).setPosition(infoX, y); y += 52;
   }
   grid.setVisible(true).setPosition(twoColumns ? 0 : Math.round((innerW - cellSize * DINNER_COLUMNS) / 2), twoColumns ? 0 : y);
   if (!twoColumns) y += cellSize * (gathered ? 1 : DINNER_GRID.length) + 10;
   y = placeText(status, y, compact ? 12 : 13) + 6;
   if (!allFound()) {
    let x = infoX, rowY = y;
    [prev, next, hint].forEach((b, i) => { const width = [48, 48, 70][i]; if (x > infoX && x + width > infoX + column) { x = infoX; rowY += 48; } b.setVisible(true).setPosition(x, rowY); x += width + 4; }); y = rowY + 52;
   }
   if (twoColumns) y = Math.max(y, cellSize * DINNER_GRID.length);
  } else if (!decoded && view === "help") {
   y = placeText(clue.setText("Hint helps one memory at a time: its word, its first cell, then Find it. Found words stay marked when you leave." + (scene.sys.game.device.input.touch ? "" : "\n\nArrows + Enter select a word. Tab changes clue. H hints; G guesses; R opens help. Here, Tab selects a button and Enter activates it. Escape leaves.")), y, 16) + 14;
   backToSearch.setVisible(true).setPosition(0, y); y += 54; reveal.setVisible(true).setPosition(0, y); y += 52;
  } else if (!decoded && view === "guess") {
   guessSlot.setVisible(true).setSize(Math.min(264, innerW), 44).setPosition(0, y); y += 54;
   check.setVisible(true).setPosition(0, y); y += 54; backToSearch.setVisible(true).setPosition(0, y); y += 52;
   y = placeText(status, y, 14) + 6;
  } else {
   ink.setVisible(true).setFontSize(42 * scale).setWordWrapWidth(innerW).setPosition(0, y); y += ink.height + 14;
   signature.setText(w > h ? "With love, your very particular pigeon" : "With love,\nyour very particular pigeon").setVisible(true).setFontSize((compact ? 12 : 13) * scale).setWordWrapWidth(innerW).setPosition(0, y); y += signature.height;
  }
  const contentH = y;
  paperH = Math.max(120, Math.min(h - 84, contentH + 32));
  maxScroll = Math.max(0, contentH - (paperH - 32)); scrollY = Math.max(0, Math.min(maxScroll, scrollY));
  layer.setData("paperSize", { width: paperW, height: paperH }); layer.setData("scroll", { value: scrollY, max: maxScroll });
  layer.setPosition(Math.round(w / 2), Math.round((h - 64) / 2)); dim.setSize(w, h).setY(32);
  paper.setPosition(0, 0); if (!ready) slidePaper(); content.setPosition(-paperW / 2 + 16, -paperH / 2 + 16 - scrollY);
  sheet.clear().fillStyle(PALETTE.shadow, 0.6).fillRect(-paperW / 2 + 3, -paperH / 2 + 4, paperW, paperH);
  sheet.fillStyle(PALETTE.panelLight).fillRect(-paperW / 2, -paperH / 2, paperW, paperH).lineStyle(1, PALETTE.borderLight).strokeRect(-paperW / 2, -paperH / 2, paperW, paperH);
  for (const at of [-paperH / 2 + 8, paperH / 2 - 8]) { sheet.lineStyle(1, PALETTE.borderLight, 0.24).lineBetween(-paperW / 2 + 12, at, paperW / 2 - 12, at); sheet.lineStyle(1, 0xffffff, 0.7).lineBetween(-paperW / 2 + 12, at + 1, paperW / 2 - 12, at + 1); }
  for (let i = 0; i < 12; i++) sheet.fillStyle(PALETTE.borderLight, 0.3).fillRect(-paperW / 2 + 5 + (i % 3), -paperH / 2 + 8 + i * (paperH - 16) / 12, 2, 1);
  keep.setVisible(ready && decoded).setPosition(-72, paperH / 2 + 12);
  const complete = ready && !decoded && view === "search" && allFound(), footerW = complete ? (maxScroll > 0 ? 306 : 222) : maxScroll > 0 ? 252 : 166;
  later.setVisible(ready && !decoded).setPosition(-footerW / 2, paperH / 2 + 12); help.setVisible(ready && !decoded && !complete).setPosition(-footerW / 2 + 92, paperH / 2 + 12).setLabel(view === "help" ? "Search" : "Help");
  read.setVisible(complete).setPosition(-footerW / 2 + 90, paperH / 2 + 12);
  scroll.setVisible(ready && maxScroll > 0).setPosition(decoded ? 78 : -footerW / 2 + (complete ? 226 : 172), paperH / 2 + 12).setLabel(scrollY >= maxScroll ? "Top ↑" : "More ↓");
  // A mask clips paint, not input: off-paper controls must not receive ghost taps.
  for (const object of content.list) {
   if (![prev, next, hint, guess, backToSearch, reveal, check].includes(object as typeof prev)) continue;
   const hit = (object as typeof prev).list[2] as Phaser.GameObjects.Rectangle;
   const bounds = hit.getBounds(), top = paper.getWorldTransformMatrix().transformPoint(0, -paperH / 2 + 14).y;
   hit.setVisible(bounds.y >= top && bounds.bottom <= top + paperH - 28);
  }
  drawCells(); mask(); placeInput();
 };
 const beginExtraction = (animate = true) => {
  anchor = hover = dragStart = null; scrollY = 0; clearing = animate && !still;
  extraction.value = clearing ? 0 : 1; refresh(); layout();
  const left = new Set(dinnerLeftovers(found())), used = cells.filter((_, i) => !left.has(i)).map(c => c.tile);
  if (clearing) scene.tweens.add({ targets: extraction, value: 1, duration: MOTION.duration.badge, ease: "Quad.easeOut", onUpdate: () => used.forEach(tile => tile.setAlpha(1 - extraction.value)),
   onComplete: () => { clearing = false; refresh(); layout(); } });
 };
 const solve = (sound = true) => {
  if (decoded || !ready || closing) return;
  scene.tweens.killTweensOf(extraction); clearing = false; extraction.value = 1;
  decoded = true; saveDraft(DINNER_DESTINATION.toUpperCase()); state.setFlag("dinnerDecoded"); view = "search"; scrollY = 0; guessInput?.remove(); guessInput = null;
  layer.setData("phase", "read"); refresh(); layout(); keep.setDisabled(false); keep.setFocused(!scene.sys.game.device.input.touch);
  if (sound) getAudio(scene).sfx("reward", { volume: 0.65 });
 };
 const cellAt = (p: Phaser.Input.Pointer): number | null => {
  const bounds = grid.getBounds(), top = paper.getWorldTransformMatrix().transformPoint(0, -paperH / 2 + 14).y;
  if (p.x < bounds.x || p.x >= bounds.x + cellSize * DINNER_COLUMNS || p.y < bounds.y || p.y >= bounds.y + cellSize * DINNER_GRID.length || p.y < top || p.y >= top + paperH - 28) return null;
  const index = Math.floor((p.y - bounds.y) / cellSize) * DINNER_COLUMNS + Math.floor((p.x - bounds.x) / cellSize);
  return cells[index]?.hit.input?.enabled ? index : null;
 };
 const onMove = (p: Phaser.Input.Pointer) => { if (dragStart === null || !p.isDown) return; const i = cellAt(p); if (i !== null) { hover = focusCell = i; drawCells(); } };
 const onUp = (p: Phaser.Input.Pointer) => { if (dragStart === null) return; const i = cellAt(p); dragStart = null; if (i !== null) commit(i); else { anchor = hover = null; drawCells(); } };
 const onWheel = (_p: Phaser.Input.Pointer, _over: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => { if (!ready || closing) return; guessInput?.blur(); scrollY += dy; layout(); };
 const onKey = (event: KeyboardEvent) => {
  if (!ready || closing || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (!["Escape", "Enter", "Space", "KeyE", "KeyH", "KeyR", "KeyG", "Tab", "PageDown", "PageUp", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) return;
  event.preventDefault(); event.stopPropagation();
  if (event.code === "Escape") close();
  else if (decoded && ["Enter", "Space", "KeyE"].includes(event.code)) close(true);
  else if (!decoded) {
   if (event.code === "KeyH" && view === "search") hint.activate();
   else if (event.code === "KeyR") changeView("help");
   else if (event.code === "KeyG") changeView("guess");
   else if (event.code === "Tab" && view === "help") {
    helpFocus = helpFocus < 0 ? (event.shiftKey ? 1 : 0) : 1 - helpFocus;
    backToSearch.setFocused(helpFocus === 0); reveal.setFocused(helpFocus === 1);
    const selectedButton = helpFocus === 0 ? backToSearch : reveal;
    scrollY = Math.max(0, Math.min(selectedButton.y, selectedButton.y + 44 - (paperH - 32))); layout();
   }
   else if (["Enter", "Space"].includes(event.code) && view === "help" && helpFocus >= 0) (helpFocus === 0 ? backToSearch : reveal).activate();
   else if (["Enter", "Space"].includes(event.code) && view === "guess") check.activate();
   else if (event.code === "PageDown" || event.code === "PageUp") { scrollY += event.code === "PageDown" ? paperH / 2 : -paperH / 2; layout(); }
   else if (view === "search" && allFound()) { if (["Enter", "Space"].includes(event.code)) read.activate(); }
   else if (event.code === "Tab" && view === "search") selectMemory(selected + (event.shiftKey ? -1 : 1));
   else if (view === "search") {
    const delta = event.code === "ArrowLeft" ? -1 : event.code === "ArrowRight" ? 1 : event.code === "ArrowUp" ? -DINNER_COLUMNS : event.code === "ArrowDown" ? DINNER_COLUMNS : 0;
    if (delta) {
     focusCell = Math.max(0, Math.min(cells.length - 1, focusCell + delta)); if (anchor !== null) hover = focusCell;
     const top = grid.y + Math.floor(focusCell / DINNER_COLUMNS) * cellSize;
     if (top < scrollY) scrollY = top; else if (top + cellSize > scrollY + paperH - 32) scrollY = top + cellSize - paperH + 32;
     layout();
    }
    else if (["Enter", "Space"].includes(event.code) && cells[focusCell].hit.input?.enabled) { if (anchor === null) { anchor = hover = focusCell; drawCells(); } else commit(focusCell); }
   }
  }
 };
 const resize = () => {
  const editing = guessInput && document.activeElement === guessInput;
  layout();
  if (editing) { scrollY = Math.max(0, Math.min(guessSlot.y, guessSlot.y + 44 - (paperH - 32))); layout(); }
 };
 const cleanup = () => {
  scene.tweens.killTweensOf([extraction, opening, art, flap, envelope, seal, address]);
  scene.scale.off(Phaser.Scale.Events.RESIZE, resize); scene.game.registry.events.off(TEXT_SCALE_CHANGED, resize); scene.input.keyboard?.off("keydown", onKey);
  scene.input.off("pointermove", onMove); scene.input.off("pointerup", onUp); scene.input.off("wheel", onWheel); scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  guessInput?.remove(); guessInput = null; clip.destroy(); contentClip.destroy();
 };
 scene.scale.on(Phaser.Scale.Events.RESIZE, resize); scene.game.registry.events.on(TEXT_SCALE_CHANGED, resize); scene.input.keyboard?.on("keydown", onKey);
 scene.input.on("pointermove", onMove); scene.input.on("pointerup", onUp); scene.input.on("wheel", onWheel); scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
 const unfold = () => {
  ready = true; paper.setPosition(0, 0).setAlpha(1); envelope.setVisible(false); mask(); layer.setData("phase", "puzzle");
  getAudio(scene).sfx("journal-open", { volume: 0.35 });
  [prev, next, hint, guess, backToSearch, reveal, check, later, help, scroll].forEach(b => b.setDisabled(false));
  refresh(); layout(); if (state.flag("dinnerDecoded")) solve(false); else if (allFound()) beginExtraction(false);
 };
 if (allFound()) extraction.value = 1;
 layer.setData("phase", "opening"); refresh(); layout(); paper.setAlpha(0);
 if (still) unfold();
 else {
  art.setPosition(from.x - layer.x, from.y - layer.y).setScale(0.14);
  scene.tweens.add({ targets: art, x: 0, y: 0, scale: 1, duration: 300, ease: "Cubic.easeOut", onUpdate: mask, onComplete: () => {
   scene.tweens.add({ targets: seal, y: -5, alpha: 0, duration: 140 }); scene.tweens.add({ targets: address, alpha: 0, duration: 140 });
   scene.tweens.add({ targets: flap, scaleY: 0, duration: 100, ease: "Sine.easeIn", onComplete: () => {
    envelope.remove(flap); art.addAt(flap, 0); flap.setPosition(0, -62);
    scene.tweens.add({ targets: flap, scaleY: -0.9, duration: 140, ease: "Sine.easeOut", onComplete: () => {
     scene.tweens.add({ targets: opening, value: 1, delay: 100, duration: 500, ease: "Sine.easeInOut", onStart: () => paper.setAlpha(1), onUpdate: slidePaper, onComplete: () => {
      scene.tweens.add({ targets: [envelope, flap], alpha: 0, duration: MOTION.duration.badge, onComplete: unfold });
     } });
    } });
   } });
  } });
 }
}
