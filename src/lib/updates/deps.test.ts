import { describe, expect, test } from "bun:test";
import { type GithubFetch, UPDATE_FETCH_TIMEOUT_MS, fetchLatestRelease } from "@/lib/updates/deps";

/** Short enough for a test, and the number the assertions are written against. */
const TEST_TIMEOUT_MS = 40;

function responding(body: unknown, ok = true): GithubFetch {
	return async () => ({ ok, json: async () => body });
}

describe("fetchLatestRelease", () => {
	test("a tag name becomes the version", async () => {
		await expect(fetchLatestRelease(responding({ tag_name: "v1.2.3" }))).resolves.toEqual({
			version: "1.2.3",
		});
	});

	test("a release without a tag falls back to its name", async () => {
		await expect(
			fetchLatestRelease(responding({ name: "quarry 0.1.0-alpha.81" })),
		).resolves.toEqual({ version: "quarry 0.1.0-alpha.81" });
	});

	test("a failed response is no version, not an error", async () => {
		await expect(fetchLatestRelease(responding({}, false))).resolves.toBeNull();
	});

	test("an answer with neither field is no version", async () => {
		await expect(fetchLatestRelease(responding({}))).resolves.toBeNull();
	});

	test("a request that never settles is abandoned at the bound", async () => {
		const seen: { signal: AbortSignal | null } = { signal: null };
		const hanging: GithubFetch = (_url, given) => {
			seen.signal = given;
			return new Promise(() => {});
		};

		const started = Date.now();
		const result = await fetchLatestRelease(hanging, TEST_TIMEOUT_MS);

		expect(result).toBeNull();
		expect(Date.now() - started).toBeLessThan(500);
		expect(seen.signal?.aborted).toBe(true);
	});

	test("a body that never settles is abandoned at the bound", async () => {
		const hangingBody: GithubFetch = async () => ({
			ok: true,
			json: () => new Promise(() => {}),
		});

		const started = Date.now();
		const result = await fetchLatestRelease(hangingBody, TEST_TIMEOUT_MS);

		expect(result).toBeNull();
		expect(Date.now() - started).toBeLessThan(500);
	});

	test("the shipped bound is the documented one", () => {
		expect(UPDATE_FETCH_TIMEOUT_MS).toBe(8000);
	});
});
