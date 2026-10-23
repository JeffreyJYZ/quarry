import { describe, expect, test } from "bun:test";
import type { LaunchPreset } from "@/lib/project/api";
import { splitArgs as runSplitArgs } from "@/lib/run/splitArgs";
import {
	joinArgs,
	joinInitCommands,
	splitInitCommands,
	toDraftPreset,
	toLaunchPreset,
	validateLaunchFile,
	validatePresets,
} from "@/lib/debug/presets";

/** A preset as it arrives from a hand-written `.quarry/launch.json`. */
function rustPreset(): LaunchPreset {
	return {
		name: "rust main",
		program: "target/debug/app",
		args: ["--flag value", "--plain", ""],
		cwd: "src-tauri",
		build: "cargo build",
		stopOnEntry: true,
		initCommands: [
			"command script import /opt/rust/lib/rustlib/etc/lldb_lookup.py",
			"command source /opt/rust/lib/rustlib/etc/lldb_commands",
		],
	};
}

describe("editor round trip", () => {
	test("keeps build and initCommands verbatim", () => {
		const preset = rustPreset();
		const saved = toLaunchPreset(toDraftPreset(preset));
		expect(saved.build).toBe("cargo build");
		expect(saved.initCommands).toEqual(preset.initCommands);
		expect(saved).toEqual(preset);
	});

	test("keeps initCommands through an edit of another field", () => {
		const draft = { ...toDraftPreset(rustPreset()), name: "renamed" };
		const saved = toLaunchPreset(draft);
		expect(saved.name).toBe("renamed");
		expect(saved.initCommands).toEqual(rustPreset().initCommands);
		expect(saved.build).toBe("cargo build");
	});

	test("an untouched build hint survives an empty one being absent", () => {
		const preset = { ...rustPreset(), build: null, initCommands: [] };
		expect(toLaunchPreset(toDraftPreset(preset))).toEqual(preset);
	});

	test("multiline initCommands become one command per non-empty line", () => {
		const draft = {
			...toDraftPreset(rustPreset()),
			initCommands: [
				"command script import /opt/rust/lib/rustlib/etc/lldb_lookup.py",
				"",
				"   ",
				"command source /opt/rust/lib/rustlib/etc/lldb_commands",
			].join("\n"),
		};
		expect(toLaunchPreset(draft).initCommands).toEqual([
			"command script import /opt/rust/lib/rustlib/etc/lldb_lookup.py",
			"command source /opt/rust/lib/rustlib/etc/lldb_commands",
		]);
	});

	test("a blank initCommands textarea saves as none", () => {
		const draft = { ...toDraftPreset(rustPreset()), initCommands: "" };
		expect(toLaunchPreset(draft).initCommands).toEqual([]);
		expect(toLaunchPreset({ ...draft, initCommands: "\n  \n" }).initCommands).toEqual([]);
	});

	test("a build typed into the editor survives the save", () => {
		const draft = { ...toDraftPreset(rustPreset()), build: "cargo build --release" };
		expect(toLaunchPreset(draft).build).toBe("cargo build --release");
		expect(toLaunchPreset({ ...draft, build: "  " }).build).toBeNull();
	});

	test("initCommands round trip through the textarea unchanged", () => {
		const commands = rustPreset().initCommands;
		expect(splitInitCommands(joinInitCommands(commands))).toEqual(commands);
	});

	test("blank program and cwd save as null", () => {
		const preset = { ...rustPreset(), program: null, cwd: null };
		expect(toLaunchPreset(toDraftPreset(preset))).toEqual(preset);
	});
});

describe("editor args", () => {
	test("parse quoted args the same as the run form", () => {
		const text = 'a "b c" d';
		const preset = { ...rustPreset(), args: runSplitArgs(text) };
		const draft = toDraftPreset(preset);
		expect(draft.args).toBe('a "b c" d');
		expect(toLaunchPreset(draft).args).toEqual(runSplitArgs(text));
	});

	test("an empty args string yields no arguments", () => {
		const draft = { ...toDraftPreset(rustPreset()), args: "" };
		expect(toLaunchPreset(draft).args).toEqual([]);
		expect(toLaunchPreset({ ...draft, args: "   " }).args).toEqual([]);
	});

	test("joinArgs quotes only what would otherwise split or vanish", () => {
		expect(joinArgs(["a", "b", "c"])).toBe("a b c");
		expect(joinArgs(["a b", "c"])).toBe('"a b" c');
		expect(joinArgs(["a", "", "b"])).toBe('a "" b');
	});

	test("round trips quoted and empty arguments", () => {
		const args = ["a b", "", "c"];
		expect(runSplitArgs(joinArgs(args))).toEqual(args);
	});
});

describe("validatePresets", () => {
	test("empty name", () => {
		expect(validatePresets([""])).not.toBeNull();
	});
	test("duplicate", () => {
		expect(validatePresets(["a", "a"])).not.toBeNull();
	});
	test("ok", () => {
		expect(validatePresets(["a", "b"])).toBeNull();
	});
});

describe("validateLaunchFile", () => {
	test("unknown field", () => {
		expect(
			validateLaunchFile({ configurations: [{ name: "x", foo: 1 }] } as {
				configurations: Array<Record<string, unknown>>;
			}),
		).not.toBeNull();
	});
	test("ok", () => {
		expect(
			validateLaunchFile({
				configurations: [
					{
						name: "x",
						program: "p",
						args: [],
						cwd: null,
						build: null,
						stopOnEntry: false,
						initCommands: [],
					},
				],
			}),
		).toBeNull();
	});
});
