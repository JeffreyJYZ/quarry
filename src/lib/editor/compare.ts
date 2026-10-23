export function sameLines(left: readonly number[], right: readonly number[]): boolean {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) return false;
	}
	return true;
}

export function sameSet(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
	if (left.size !== right.size) return false;
	for (const value of left) {
		if (!right.has(value)) return false;
	}
	return true;
}
