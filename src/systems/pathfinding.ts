/**
 * Grid A* for tap-to-move. Pure: no Phaser here, so it runs in the unit tests.
 *
 * The grid is built from the scene's static bodies with Frankie's own foot body (28x14, anchored at
 * his feet) swept over every cell: a cell is free when the body standing there touches nothing.
 * That is the same test the reachability harness uses, so "the path ends here" and "he can stand
 * here" agree. 8-neighbour moves, no corner cutting (a diagonal step needs both orthogonal cells
 * free, or he would clip a corner his body can't actually pass).
 */

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface NavGrid {
	cell: number;
	originX: number;
	originY: number;
	cols: number;
	rows: number;
	/** 1 = free, 0 = blocked. Row-major. */
	free: Uint8Array;
}

export const NAV_CELL = 8;

export function buildGrid(bounds: Rect, colliders: Rect[], body: { width: number; height: number }, cell = NAV_CELL): NavGrid {
	const cols = Math.max(1, Math.floor(bounds.width / cell));
	const rows = Math.max(1, Math.floor(bounds.height / cell));
	const free = new Uint8Array(cols * rows);
	const hw = body.width / 2;
	for (let r = 0; r < rows; r++) {
		const py = bounds.y + r * cell + cell / 2;
		const y0 = py - body.height;
		for (let c = 0; c < cols; c++) {
			const px = bounds.x + c * cell + cell / 2;
			const x0 = px - hw;
			const x1 = px + hw;
			let blocked = x0 < bounds.x || y0 < bounds.y || x1 > bounds.x + bounds.width || py > bounds.y + bounds.height;
			if (!blocked) {
				for (const b of colliders) {
					if (x0 < b.x + b.width && x1 > b.x && y0 < b.y + b.height && py > b.y) {
						blocked = true;
						break;
					}
				}
			}
			free[r * cols + c] = blocked ? 0 : 1;
		}
	}
	return { cell, originX: bounds.x, originY: bounds.y, cols, rows, free };
}

export function toCell(grid: NavGrid, x: number, y: number): { c: number; r: number } {
	return {
		c: Math.max(0, Math.min(grid.cols - 1, Math.floor((x - grid.originX) / grid.cell))),
		r: Math.max(0, Math.min(grid.rows - 1, Math.floor((y - grid.originY) / grid.cell))),
	};
}

export function cellCentre(grid: NavGrid, c: number, r: number): { x: number; y: number } {
	return { x: grid.originX + c * grid.cell + grid.cell / 2, y: grid.originY + r * grid.cell + grid.cell / 2 };
}

export function isFree(grid: NavGrid, c: number, r: number): boolean {
	return c >= 0 && r >= 0 && c < grid.cols && r < grid.rows && grid.free[r * grid.cols + c] === 1;
}

/** The free cell nearest to (x, y), searched in rings; null if nothing within `maxRadiusCells`. */
export function nearestFreeCell(grid: NavGrid, x: number, y: number, maxRadiusCells = 12): { c: number; r: number } | null {
	const { c, r } = toCell(grid, x, y);
	if (isFree(grid, c, r)) return { c, r };
	let best = null as { c: number; r: number; d: number } | null;
	for (let ring = 1; ring <= maxRadiusCells; ring++) {
		for (let dr = -ring; dr <= ring; dr++) {
			for (let dc = -ring; dc <= ring; dc++) {
				if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
				const cc = c + dc;
				const rr = r + dr;
				if (!isFree(grid, cc, rr)) continue;
				const p = cellCentre(grid, cc, rr);
				const d = Math.hypot(p.x - x, p.y - y);
				if (!best || d < best.d) best = { c: cc, r: rr, d };
			}
		}
		if (best) return { c: best.c, r: best.r };
	}
	return null;
}

const DIRS: [number, number, number][] = [
	[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
	[1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * A* from world point to world point. Returns waypoints in world space (cell centres, the start
 * cell omitted, corners only -- collinear runs are collapsed), or null when unreachable. The start
 * snaps to the nearest free cell (Frankie's foot point can sit a pixel inside a body he is pressed
 * against); the goal snaps to the nearest free cell to the tap.
 */
export function findPath(grid: NavGrid, from: { x: number; y: number }, to: { x: number; y: number }, maxExpansions = 20000): { x: number; y: number }[] | null {
	const start = nearestFreeCell(grid, from.x, from.y, 4);
	const goal = nearestFreeCell(grid, to.x, to.y);
	if (!start || !goal) return null;
	const { cols, rows } = grid;
	const idx = (c: number, r: number) => r * cols + c;
	const startI = idx(start.c, start.r);
	const goalI = idx(goal.c, goal.r);
	if (startI === goalI) return [cellCentre(grid, goal.c, goal.r)];

	const g = new Float64Array(cols * rows).fill(Infinity);
	const came = new Int32Array(cols * rows).fill(-1);
	const closed = new Uint8Array(cols * rows);
	const h = (c: number, r: number) => {
		const dc = Math.abs(c - goal.c);
		const dr = Math.abs(r - goal.r);
		return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
	};
	// Binary heap on f.
	const heap: number[] = [];
	const fOf = new Float64Array(cols * rows);
	const push = (i: number) => {
		heap.push(i);
		let k = heap.length - 1;
		while (k > 0) {
			const p = (k - 1) >> 1;
			if (fOf[heap[p]] <= fOf[heap[k]]) break;
			[heap[p], heap[k]] = [heap[k], heap[p]];
			k = p;
		}
	};
	const pop = (): number => {
		const top = heap[0];
		const last = heap.pop()!;
		if (heap.length) {
			heap[0] = last;
			let k = 0;
			for (;;) {
				const l = 2 * k + 1;
				const rr = l + 1;
				let m = k;
				if (l < heap.length && fOf[heap[l]] < fOf[heap[m]]) m = l;
				if (rr < heap.length && fOf[heap[rr]] < fOf[heap[m]]) m = rr;
				if (m === k) break;
				[heap[m], heap[k]] = [heap[k], heap[m]];
				k = m;
			}
		}
		return top;
	};

	g[startI] = 0;
	fOf[startI] = h(start.c, start.r);
	push(startI);
	let expansions = 0;
	while (heap.length) {
		const cur = pop();
		if (closed[cur]) continue;
		closed[cur] = 1;
		if (cur === goalI) break;
		if (++expansions > maxExpansions) return null;
		const cc = cur % cols;
		const cr = (cur - cc) / cols;
		for (const [dc, dr, cost] of DIRS) {
			const nc = cc + dc;
			const nr = cr + dr;
			if (!isFree(grid, nc, nr)) continue;
			// No corner cutting.
			if (dc !== 0 && dr !== 0 && (!isFree(grid, cc + dc, cr) || !isFree(grid, cc, cr + dr))) continue;
			const ni = idx(nc, nr);
			if (closed[ni]) continue;
			const ng = g[cur] + cost;
			if (ng < g[ni]) {
				g[ni] = ng;
				came[ni] = cur;
				fOf[ni] = ng + h(nc, nr);
				push(ni);
			}
		}
	}
	if (came[goalI] < 0 && goalI !== startI) return null;

	// Walk back, then keep only direction changes (measured from the start cell, so a straight run
	// from where he stands is a single waypoint).
	const cells: number[] = [];
	for (let i = goalI; i >= 0 && i !== startI; i = came[i]) cells.push(i);
	cells.reverse();
	const pts = [cellCentre(grid, start.c, start.r), ...cells.map((i) => cellCentre(grid, i % cols, Math.floor(i / cols)))];
	const out: { x: number; y: number }[] = [];
	for (let i = 1; i < pts.length; i++) {
		if (i === pts.length - 1) {
			out.push(pts[i]);
			continue;
		}
		const a = pts[i - 1];
		const b = pts[i];
		const c = pts[i + 1];
		const collinear = (b.x - a.x) * (c.y - b.y) === (b.y - a.y) * (c.x - b.x);
		if (!collinear) out.push(b);
	}
	return out;
}

/** Segment/obstacle test shared by walking and interaction reach (a zero-size body). */
export function segmentClear(a: { x: number; y: number }, b: { x: number; y: number }, colliders: Rect[], body = { width: 0, height: 0 }) {
	return colliders.every(rect => {
		// Expand the obstacle by the foot box, then intersect the movement segment with it.
		const lo = [rect.x - body.width / 2, rect.y];
		const hi = [rect.x + rect.width + body.width / 2, rect.y + rect.height + body.height];
		const start = [a.x, a.y], delta = [b.x - a.x, b.y - a.y];
		let enter = 0, leave = 1;
		for (let axis = 0; axis < 2; axis++) {
			if (Math.abs(delta[axis]) < 1e-8) {
				if (start[axis] <= lo[axis] || start[axis] >= hi[axis]) return true;
			} else {
				const t1 = (lo[axis] - start[axis]) / delta[axis];
				const t2 = (hi[axis] - start[axis]) / delta[axis];
				enter = Math.max(enter, Math.min(t1, t2));
				leave = Math.min(leave, Math.max(t1, t2));
			}
		}
		return enter >= leave;
	});
}

/** Remove grid stair-steps only when the actor's entire swept foot box clears the art colliders. */
export function smoothPath(from: { x: number; y: number }, path: { x: number; y: number }[], colliders: Rect[], body: { width: number; height: number }) {
	const result: typeof path = [];
	let anchor = from;
	for (let i = 0; i < path.length;) {
		let end = path.length - 1;
		while (end > i && !segmentClear(anchor, path[end], colliders, body)) end--;
		result.push(path[end]);
		anchor = path[end];
		i = end + 1;
	}
	return result;
}
