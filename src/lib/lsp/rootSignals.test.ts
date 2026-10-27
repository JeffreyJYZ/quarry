import { describe, expect, test, mock } from "bun:test";

mock.module("@/lib/project/api", () => ({
	listDir: async (path: string) => {
		const entries =
			(globalThis as { __rsEntries?: Record<string, any[]> }).__rsEntries?.[path] ?? [];
		return entries;
	},
}));

import { probeRootSignals, decideRootSignals } from "@/lib/lsp/rootSignals";
import { serversForRoot } from "@/lib/lsp/served";

function setTree(tree: Record<string, any[]>) {
	(globalThis as unknown as { __rsEntries: Record<string, any[]> }).__rsEntries = tree;
}

describe("decideRootSignals", () => {
	test("Cargo.toml alone -> rust only", () => {
		const s = decideRootSignals({
			hasCargoToml: true,
			hasCompileCommands: false,
			hasCMakeLists: false,
			hasCppFiles: false,
		});
		expect(serversForRoot(s)).toEqual(["rust-analyzer"]);
	});
	test("compile_commands.json alone -> clangd", () => {
		const s = decideRootSignals({
			hasCargoToml: false,
			hasCompileCommands: true,
			hasCMakeLists: false,
			hasCppFiles: false,
		});
		expect(serversForRoot(s)).toEqual(["clangd"]);
	});
});

describe("probeRootSignals", () => {
	test("Cargo.toml alone -> rust only", async () => {
		const root = "/tmp/rs-cargo";
		setTree({ [root]: [{ name: "Cargo.toml", isDir: false, path: `${root}/Cargo.toml` }] });
		const s = await probeRootSignals(root);
		expect(serversForRoot(s)).toEqual(["rust-analyzer"]);
	});

	test("cpp under skipped dir not found", async () => {
		const root = "/tmp/rs-skip";
		setTree({
			[root]: [{ name: "target", isDir: true, path: `${root}/target` }],
			[`${root}/target`]: [{ name: "a.cpp", isDir: false, path: `${root}/target/a.cpp` }],
		});
		const s = await probeRootSignals(root);
		expect(s.hasCppFiles).toBe(false);
	});

	test("depth cap stops scan", async () => {
		const root = "/tmp/rs-depth";
		// build 6 nested dirs each with a cpp at depth 5 (beyond MAX_DEPTH 4)
		const tree: Record<string, any[]> = { [root]: [] };
		let cur = root;
		for (let i = 0; i < 6; i++) {
			const next = `${cur}/d${i}`;
			tree[cur] = [{ name: `d${i}`, isDir: true, path: next }];
			cur = next;
		}
		tree[cur] = [{ name: "x.cpp", isDir: false, path: `${cur}/x.cpp` }];
		setTree(tree);
		const s = await probeRootSignals(root);
		expect(s.hasCppFiles).toBe(false);
	});

	test("dir budget cap stops scan", async () => {
		const root = "/tmp/rs-budget";
		const tree: Record<string, any[]> = { [root]: [] };
		// 65 child dirs at root -> exceeds MAX_DIRS 64
		const children: any[] = [];
		for (let i = 0; i < 65; i++) {
			const p = `${root}/d${i}`;
			children.push({ name: `d${i}`, isDir: true, path: p });
			tree[p] = [];
		}
		tree[root] = children;
		setTree(tree);
		const s = await probeRootSignals(root);
		expect(s.hasCppFiles).toBe(false);
	});

	test("compile_commands.json alone -> clangd", async () => {
		const root = "/tmp/rs-cc";
		setTree({
			[root]: [
				{
					name: "compile_commands.json",
					isDir: false,
					path: `${root}/compile_commands.json`,
				},
			],
		});
		const s = await probeRootSignals(root);
		expect(serversForRoot(s)).toEqual(["clangd"]);
	});
});
