export function splitPath(path: string): { name: string; parent: string } {
	const trimmed = path.replace(/\/+$/, "");
	const index = trimmed.lastIndexOf("/");
	if (index <= 0) {
		return { name: trimmed, parent: "" };
	}
	return { name: trimmed.slice(index + 1), parent: trimmed.slice(0, index) };
}
