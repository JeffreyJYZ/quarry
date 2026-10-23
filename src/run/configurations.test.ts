import { describe, expect, test } from "bun:test";
import type { RunConfiguration } from "@/project/api";
import {
	applyConfiguration,
	configurationNameError,
	type RunFormSnapshot,
	snapshotConfiguration,
} from "./configurations";

const form: RunFormSnapshot = {
	program: "/tmp/project/target/debug/app",
	args: '--port 8080 --name "two words"',
	cwd: "/tmp/project",
	env: [
		{ name: "RUST_LOG", value: "debug" },
		{ name: "EMPTY", value: "" },
	],
};

const existing: RunConfiguration[] = [
	snapshotConfiguration("server", form),
	snapshotConfiguration("tests", form),
];

describe("run configurations", () => {
	test("a snapshot trims the name and keeps the args field verbatim", () => {
		const config = snapshotConfiguration("  server  ", form);

		expect(config.name).toBe("server");
		expect(config.args).toBe(form.args);
		expect(config.env).toEqual([
			["RUST_LOG", "debug"],
			["EMPTY", ""],
		]);
	});

	test("applying a configuration fills every form field and env row order", () => {
		const loaded = applyConfiguration(snapshotConfiguration("server", form));

		expect(loaded).toEqual(form);
	});

	test("snapshot then apply is the identity on the form", () => {
		expect(applyConfiguration(snapshotConfiguration("server", form))).toEqual(form);
	});

	test("an empty or whitespace name is rejected", () => {
		expect(configurationNameError("", existing)).toBe("configuration name is required");
		expect(configurationNameError("   ", existing)).toBe("configuration name is required");
	});

	test("a duplicate name is rejected, ignoring surrounding whitespace", () => {
		expect(configurationNameError("server", existing)).toBe(
			"duplicate configuration name: server",
		);
		expect(configurationNameError("  server ", existing)).toBe(
			"duplicate configuration name: server",
		);
	});

	test("an unused name is accepted", () => {
		expect(configurationNameError("release", existing)).toBeNull();
	});

	test("an update may keep its own name", () => {
		expect(configurationNameError("server", existing, "server")).toBeNull();
	});

	test("an update may not take another configuration's name", () => {
		expect(configurationNameError("tests", existing, "server")).toBe(
			"duplicate configuration name: tests",
		);
	});
});
