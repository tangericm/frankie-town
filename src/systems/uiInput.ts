/** Container children keep their own scroll factor even when their parent is screen-pinned. */
export function isScreenUI(object: { scrollFactorX?: number; parentContainer?: unknown }): boolean {
	let current: typeof object | null = object;
	while (current) {
		if (current.scrollFactorX === 0) return true;
		current = current.parentContainer as typeof object | null;
	}
	return false;
}
