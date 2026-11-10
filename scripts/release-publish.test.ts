import { describe, expect, test } from "bun:test";
import { type Asset, uploadAssets } from "./release-publish";

const TAG = "quarry-alpha9";
const ASSETS: Asset[] = [
	{ path: "/tmp/quarry.app.tar.gz", name: "quarry.app.tar.gz" },
	{ path: "/tmp/latest.json", name: "latest.json" },
];

/** A fake `gh`: the named asset fails the first `failures` times, every call is recorded. */
function fakeGh(failures: Record<string, number>, calls: string[]) {
	return (_command: string, args: string[]): string => {
		const ref = args[3] ?? "";
		calls.push(ref);
		const name = ref.slice(ref.indexOf("#") + 1);
		const left = failures[name] ?? 0;
		if (left > 0) {
			failures[name] = left - 1;
			throw new Error("HTTP 502");
		}
		return "";
	};
}

describe("uploadAssets", () => {
	test("uploads every asset once when nothing fails", () => {
		const calls: string[] = [];
		uploadAssets(fakeGh({}, calls), TAG, ASSETS);
		expect(calls).toEqual([
			"/tmp/quarry.app.tar.gz#quarry.app.tar.gz",
			"/tmp/latest.json#latest.json",
		]);
	});

	test("a transient failure is retried once and then succeeds", () => {
		const calls: string[] = [];
		uploadAssets(fakeGh({ "latest.json": 1 }, calls), TAG, ASSETS);
		expect(calls).toEqual([
			"/tmp/quarry.app.tar.gz#quarry.app.tar.gz",
			"/tmp/latest.json#latest.json",
			"/tmp/latest.json#latest.json",
		]);
	});

	test("a second failure names the tag and the missing asset", () => {
		const calls: string[] = [];
		expect(() => uploadAssets(fakeGh({ "quarry.app.tar.gz": 2 }, calls), TAG, ASSETS)).toThrow(
			`release ${TAG} is missing quarry.app.tar.gz after 2 attempts: HTTP 502`,
		);
		// It stops at the asset that failed rather than pretending the later ones were uploaded.
		expect(calls).toEqual([
			"/tmp/quarry.app.tar.gz#quarry.app.tar.gz",
			"/tmp/quarry.app.tar.gz#quarry.app.tar.gz",
		]);
	});
});
