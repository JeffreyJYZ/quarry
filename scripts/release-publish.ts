/**
 * Release asset uploads, one asset per call and retried once.
 *
 * `gh release upload` accepts many assets and fails the whole invocation on one bad file. By then
 * the release is public and the updater can see a tag whose assets are only half there. Uploading a
 * single asset per call limits a failure to that asset, and the error names the tag and the missing
 * asset so a half-populated release can never be mistaken for a finished one.
 */
export type Runner = (command: string, args: string[]) => string;

export type Asset = { path: string; name: string };

export const UPLOAD_ATTEMPTS = 2;

function uploadOnce(run: Runner, tag: string, asset: Asset): void {
	run("gh", ["release", "upload", tag, `${asset.path}#${asset.name}`, "--clobber"]);
}

function uploadWithRetry(run: Runner, tag: string, asset: Asset): string | null {
	let error = "";
	for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
		try {
			uploadOnce(run, tag, asset);
			return null;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		}
	}
	return `release ${tag} is missing ${asset.name} after ${UPLOAD_ATTEMPTS} attempts: ${error}`;
}

/** Uploads each asset, retrying a failed one once, and throws naming the first that still fails. */
export function uploadAssets(run: Runner, tag: string, assets: readonly Asset[]): void {
	for (const asset of assets) {
		const problem = uploadWithRetry(run, tag, asset);
		if (problem !== null) throw new Error(problem);
	}
}
