import { describe, expect, test } from "bun:test";
import type { RunTarget } from "@/lib/project/api";
import { preferredTargetId, targetEntries } from "@/lib/run/targets";

function cargo(pkg: string, bin: string): RunTarget {
	return {
		id: `cargo:${pkg}:${bin}`,
		label: `${bin} (${pkg})`,
		kind: "cargo",
		package: pkg,
		target: bin,
	};
}

const workspace: RunTarget[] = [cargo("core", "cmduse"), cargo("core", "server")];

describe("targetEntries", () => {
	test("detected targets come before presets", () => {
		const entries = targetEntries(workspace, [{ name: "local" }]);

		expect(entries.map((entry) => entry.value)).toEqual([
			"cargo:core:cmduse",
			"cargo:core:server",
			"local",
		]);
		expect(entries[0].label).toBe("cmduse (core)");
		expect(entries[2].label).toBe("local");
	});

	test("a preset named like a target id adds no duplicate row", () => {
		const entries = targetEntries(workspace, [
			{ name: "cargo:core:server" },
			{ name: "local" },
		]);

		expect(entries.map((entry) => entry.value)).toEqual([
			"cargo:core:cmduse",
			"cargo:core:server",
			"local",
		]);
	});

	test("no targets leaves the presets alone", () => {
		const entries = targetEntries([], [{ name: "local" }, { name: "local" }]);

		expect(entries.map((entry) => entry.value)).toEqual(["local"]);
	});

	test("nothing detected and no presets is an empty dropdown", () => {
		expect(targetEntries([], [])).toEqual([]);
	});
});

describe("preferredTargetId", () => {
	test("a remembered target that still exists wins over the default binary", () => {
		expect(preferredTargetId(workspace, "cargo:core:server")).toBe("cargo:core:server");
	});

	test("a remembered target that is gone falls through", () => {
		expect(preferredTargetId(workspace, "cargo:core:deleted")).toBe("cargo:core:cmduse");
	});

	test("the only target is the answer even when the package names another binary", () => {
		const single = [cargo("core", "other")];

		expect(preferredTargetId(single, null)).toBe("cargo:core:other");
	});

	test("Cargo's default binary wins among several, not the first row", () => {
		const targets = [cargo("core", "alpha"), cargo("core", "core")];

		expect(preferredTargetId(targets, null)).toBe("cargo:core:core");
	});

	test("no default binary falls back to the first row", () => {
		expect(preferredTargetId(workspace, null)).toBe("cargo:core:cmduse");
		expect(preferredTargetId(workspace, "cargo:core:deleted-again")).toBe("cargo:core:cmduse");
	});

	test("a C++ project takes its first executable", () => {
		const targets: RunTarget[] = [
			{ id: "cpp:alpha", label: "alpha", kind: "cpp", package: "", target: "alpha" },
			{ id: "cpp:beta", label: "beta", kind: "cpp", package: "", target: "beta" },
		];

		expect(preferredTargetId(targets, null)).toBe("cpp:alpha");
		expect(preferredTargetId(targets, "cpp:beta")).toBe("cpp:beta");
	});

	test("no targets and nothing remembered is null", () => {
		expect(preferredTargetId([], "cargo:core:cmduse")).toBeNull();
		expect(preferredTargetId([], null)).toBeNull();
	});
});
