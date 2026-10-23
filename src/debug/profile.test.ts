import { describe, expect, test } from "bun:test";
import { liveSessionProfileMismatch, resolveDebugArtifact } from "./profile";

describe("resolveDebugArtifact", () => {
	test("release uses the reported artefact", () => {
		expect(
			resolveDebugArtifact({ success: true, artifact: "/p/target/release/app" }, "release"),
		).toEqual({
			ok: true,
			program: "/p/target/release/app",
		});
	});
	test("missing release artefact fails", () => {
		expect(resolveDebugArtifact({ success: true }, "release")).toEqual({
			ok: false,
			error: "Build succeeded but the release binary is missing",
		});
	});
	test("debug keeps the configured program", () => {
		expect(resolveDebugArtifact({ success: true }, "debug")).toEqual({
			ok: true,
			program: null,
		});
	});
});

describe("liveSessionProfileMismatch", () => {
	test("null without a live session", () => {
		expect(liveSessionProfileMismatch("debug", "release", false)).toBeNull();
	});
	test("null when unchanged", () => {
		expect(liveSessionProfileMismatch("debug", "debug", true)).toBeNull();
	});
	test("message when changed", () => {
		expect(liveSessionProfileMismatch("debug", "release", true)).toBe(
			"Build profile changed to release while a debug debug session is live",
		);
	});
});
