export function isInside(root: string, target: string | null): boolean {
	if (target === null) return false;
	if (root.includes("\\") || target.includes("\\")) return false;
	const normalizedRoot = root.replace(/\/+$/, "");
	if (normalizedRoot === "") return false;
	if (target === normalizedRoot) return false;
	return target.startsWith(`${normalizedRoot}/`);
}

export function ancestorDirs(root: string, target: string): string[] {
	if (!isInside(root, target)) return [];
	const normalizedRoot = root.replace(/\/+$/, "");
	const parts = target
		.slice(normalizedRoot.length + 1)
		.split("/")
		.filter((p) => p.length > 0);
	if (parts.length <= 1) return [];
	let current = normalizedRoot;
	const ancestors: string[] = [];
	for (const part of parts.slice(0, -1)) {
		current = `${current}/${part}`;
		if (current !== normalizedRoot) ancestors.push(current);
	}
	return ancestors;
}
