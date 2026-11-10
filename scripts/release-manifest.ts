export type VersionTriplet = {
	package: string;
	tauri: string;
	cargo: string;
	site: string;
	lock: string;
};

/** Every version file `bump-version.ts` writes; a half-bumped tree is refused before a build. */
export function versionDrift(v: VersionTriplet): string | null {
	if ([v.tauri, v.cargo, v.site, v.lock].every((value) => value === v.package)) return null;
	return `versions disagree: package.json=${v.package}, src-tauri/tauri.conf.json=${v.tauri}, src-tauri/Cargo.toml=${v.cargo}, website/package.json=${v.site}, src-tauri/Cargo.lock=${v.lock}`;
}

/** The version of the `quarry` crate in Cargo.lock, or "" when the entry is missing. */
export function lockVersion(text: string): string {
	for (const block of text.split("[[package]]")) {
		if (!/^name\s*=\s*"quarry"$/m.test(block)) continue;
		return /^version\s*=\s*"([^"]+)"/m.exec(block)?.[1] ?? "";
	}
	return "";
}

/**
 * The manifest URL for a tag.
 *
 * `/releases/latest` follows the newest release GitHub marked as latest, and an alpha is published
 * without `--latest`, so it keeps pointing at the last stable one. A prerelease is therefore read
 * from its own tag; only a stable release owns the `latest` alias.
 */
export function manifestUrl(repo: string, tag: string): string {
	if (isStableTag(tag)) return `https://github.com/${repo}/releases/latest/download/latest.json`;
	return `https://github.com/${repo}/releases/download/${tag}/latest.json`;
}

export type PublishedManifest = {
	version?: string;
	platforms?: Record<string, { signature?: string; url?: string }>;
};

/** Why a fetched manifest is not the one just published, or null when it is whole. */
export function manifestProblem(
	published: PublishedManifest,
	version: string,
	platforms: string[],
): string | null {
	if (published.version !== version) {
		return `the published manifest reports ${published.version ?? "no version"}, expected ${version}`;
	}
	for (const platform of platforms.filter((key) => !key.endsWith("-app"))) {
		const row = published.platforms?.[platform];
		if (row === undefined || row.signature === undefined || row.url === undefined) {
			return `the published latest.json has no usable ${platform} entry`;
		}
	}
	return null;
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
