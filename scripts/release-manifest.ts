export type VersionTriplet = {
	package: string;
	tauri: string;
	cargo: string;
};

export function versionDrift(v: VersionTriplet): string | null {
	if (v.package === v.tauri && v.tauri === v.cargo) return null;
	return `versions disagree: package.json=${v.package}, src-tauri/tauri.conf.json=${v.tauri}, src-tauri/Cargo.toml=${v.cargo}`;
}

export function manifestPlatforms(): string[] {
	return ["darwin-aarch64", "darwin-x86_64", "darwin-aarch64-app", "darwin-x86_64-app"];
}

export function verifiedPlatforms(): string[] {
	return manifestPlatforms();
}

export function selectDmg(
	candidates: string[],
	version: string,
): { selected: string | null; error: string | null } {
	const pattern = new RegExp(`^quarry_${escapeRegex(version)}_[A-Za-z0-9_-]+\\.dmg$`);
	const matches = candidates.filter((name) => pattern.test(name));
	if (matches.length !== 1) {
		return {
			selected: null,
			error: `expected exactly one dmg matching quarry_${version}_<arch>.dmg, found ${matches.length}: ${matches.join(", ") || "(none)"}`,
		};
	}
	return { selected: matches[0], error: null };
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isStableTag(tag: string): boolean {
	return /^v\d+\.\d+\.\d+$/.test(tag);
}
