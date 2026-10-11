/** Seven disjoint journey memories. No alternate diagonal or connected spellings. */
export const DINNER_GRID = ["CAKEPT", "BISHAE", "UCUENA", "THGNIC", "TIASNU", "EKRAIP", "RFLOUR"];
export const DINNER_COLUMNS = DINNER_GRID[0].length;
export const DINNER_WORDS = [
	{ word: "FLOUR", clue: "Teddy's baking ingredient (5)", keepsake: "Plush tag", start: 37, end: 41 },
	{ word: "CAKE", clue: "Your birthday bake (4)", keepsake: "Plush tag", start: 0, end: 3 },
	{ word: "BUTTER", clue: "Panini's yellow ingredient (6)", keepsake: "Cup card", start: 6, end: 36 },
	{ word: "PANINI", clue: "The cat who needed a nap (6)", keepsake: "Cup card", start: 4, end: 34 },
	{ word: "TEACUP", clue: "One of your two porcelain cups (6)", keepsake: "Cup card", start: 5, end: 35 },
	{ word: "HENS", clue: "The birds you guided home (4)", keepsake: "Bridge slip", start: 9, end: 27 },
	{ word: "SUGAR", clue: "Pierre's sweet cubes (5)", keepsake: "Bridge slip", start: 8, end: 32 },
] as const;

/** A selection must follow the printed rule, not jump diagonally or wrap a row. */
export function dinnerWordPath(start: number, end: number): number[] {
	if (![start, end].every(n => Number.isInteger(n) && n >= 0 && n < DINNER_GRID.length * DINNER_COLUMNS) || end < start) return [];
	const sameRow = Math.floor(start / DINNER_COLUMNS) === Math.floor(end / DINNER_COLUMNS), sameColumn = start % DINNER_COLUMNS === end % DINNER_COLUMNS;
	if (!sameRow && !sameColumn) return [];
	const step = sameRow ? 1 : DINNER_COLUMNS;
	return Array.from({ length: (end - start) / step + 1 }, (_, i) => start + i * step);
}

export function dinnerWordAt(start: number, end: number) {
	const letters = dinnerWordPath(start, end).map(i => DINNER_GRID[Math.floor(i / DINNER_COLUMNS)][i % DINNER_COLUMNS]).join("");
	return DINNER_WORDS.find(entry => entry.word === letters);
}

export function dinnerLeftovers(found: readonly string[]): number[] {
	const covered = new Set(DINNER_WORDS.filter(entry => found.includes(entry.word)).flatMap(entry => dinnerWordPath(entry.start, entry.end)));
	return Array.from({ length: DINNER_GRID.length * DINNER_COLUMNS }, (_, i) => i).filter(i => !covered.has(i));
}
