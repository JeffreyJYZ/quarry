export type Offer =
	| { kind: "updater"; version: string; update: unknown }
	| { kind: "github"; version: string };

const VERSION_RE = /^\d+\.\d+\.\d+(?:-([0-9A-Za-z.-]+))?$/;

/** Splits a version into its numeric triple and its prerelease identifiers. */
function parseVersion(version: string): { core: number[]; pre: string[] } | null {
	const match = VERSION_RE.exec(version);
	if (match === null) return null;
	const core = version.split("-")[0].split(".").map(Number);
	const pre = match[1] === undefined ? [] : match[1].split(".");
	return { core, pre };
}

/** Semver precedence for the prerelease part: absent beats present, numbers beat words. */
function comparePrerelease(a: string[], b: string[]): number {
	if (a.length === 0 && b.length === 0) return 0;
	if (a.length === 0) return 1;
	if (b.length === 0) return -1;
	for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
		const left = a[index];
		const right = b[index];
		if (left === undefined) return -1;
		if (right === undefined) return 1;
		const leftNum = /^\d+$/.test(left);
		const rightNum = /^\d+$/.test(right);
		if (leftNum && rightNum) {
			const diff = Number(left) - Number(right);
			if (diff !== 0) return diff > 0 ? 1 : -1;
			continue;
		}
		if (leftNum !== rightNum) return leftNum ? -1 : 1;
		if (left !== right) return left > right ? 1 : -1;
	}
	return 0;
}

/**
 * Whether `latest` is a newer release than `current`. Accepts `x.y.z` and
 * `x.y.z-alpha.1`, so an alpha series can update itself; anything not matching that
 * shape compares as not newer.
 */
export function isNewer(latest: string, current: string): boolean {
	const a = parseVersion(latest);
	const b = parseVersion(current);
	if (a === null || b === null) {
		return false;
	}
	for (let index = 0; index < 3; index += 1) {
		if (a.core[index] !== b.core[index]) {
			return a.core[index] > b.core[index];
		}
	}
	return comparePrerelease(a.pre, b.pre) > 0;
}

export function offerClause(offer: Offer): string {
	return offer.kind === "updater"
		? "is available."
		: "is published, but this build cannot install it in-app.";
}

export function offerHeadline(offer: Offer): string {
	return `${offer.version} ${offerClause(offer)}`;
}

export function progressPercent(
	downloaded: number,
	total: number | null | undefined,
): number | null {
	if (total === null || total === undefined || total <= 0) {
		return null;
	}
	const value = Math.round((downloaded / total) * 100);
	if (value < 0) return 0;
	if (value > 100) return 100;
	return value;
}
