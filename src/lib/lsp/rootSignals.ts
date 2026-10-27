import { useEffect, useState } from "react";
import { listDir } from "@/lib/project/api";
import type { RootSignals } from "@/lib/lsp/served";

const SKIP_DIRS = new Set(["target", "node_modules", ".git", "build", "out"]);
const MAX_DEPTH = 4;
const MAX_DIRS = 64;

const CPP_EXTENSIONS = new Set([".c", ".h", ".cc", ".cpp", ".cxx", ".hh", ".hpp"]);

function extensionOf(name: string): string {
	const dot = name.lastIndexOf(".");
	if (dot <= 0) {
		return "";
	}
	return name.slice(dot).toLowerCase();
}

/** Pure decision: turn gathered facts into RootSignals. */
export function decideRootSignals(facts: {
	hasCargoToml: boolean;
	hasCompileCommands: boolean;
	hasCMakeLists: boolean;
	hasCppFiles: boolean;
}): RootSignals {
	return {
		hasCargoToml: facts.hasCargoToml,
		hasCompileCommands: facts.hasCompileCommands,
		hasCMakeLists: facts.hasCMakeLists,
		hasCppFiles: facts.hasCppFiles,
	};
}

const cache = new Map<string, Promise<RootSignals>>();

export async function probeRootSignals(root: string): Promise<RootSignals> {
	const cached = cache.get(root);
	if (cached !== undefined) {
		return cached;
	}
	const promise: Promise<RootSignals> = (async () => {
		let hasCargoToml = false;
		let hasCompileCommands = false;
		let hasCMakeLists = false;
		let hasCppFiles = false;
		try {
			const entries = await listDir(root);
			for (const entry of entries) {
				if (entry.name === "Cargo.toml" && !entry.isDir) {
					hasCargoToml = true;
				}
				if (entry.name === "compile_commands.json" && !entry.isDir) {
					hasCompileCommands = true;
				}
				if (entry.name === "CMakeLists.txt" && !entry.isDir) {
					hasCMakeLists = true;
				}
			}
		} catch {
			// fall through
		}
		if (!hasCppFiles) {
			hasCppFiles = await scanForCpp(root, 0, { count: 0 });
		}
		return decideRootSignals({
			hasCargoToml,
			hasCompileCommands,
			hasCMakeLists,
			hasCppFiles,
		});
	})();
	cache.set(root, promise);
	try {
		return await promise;
	} catch (error) {
		cache.delete(root);
		throw error;
	}
}

export function useRootSignals(root: string | null): RootSignals | null {
	const [signals, setSignals] = useState<RootSignals | null>(null);
	useEffect(() => {
		if (root === null) {
			setSignals(null);
			return;
		}
		let live = true;
		probeRootSignals(root).then(
			(next) => {
				if (live) setSignals(next);
			},
			() => {
				if (live) setSignals(null);
			},
		);
		return () => {
			live = false;
		};
	}, [root]);
	return signals;
}

async function scanForCpp(dir: string, depth: number, budget: { count: number }): Promise<boolean> {
	if (depth > MAX_DEPTH) {
		return false;
	}
	if (budget.count >= MAX_DIRS) {
		return false;
	}
	let entries: Awaited<ReturnType<typeof listDir>> | undefined;
	try {
		entries = await listDir(dir);
	} catch {
		return false;
	}
	budget.count += 1;
	for (const entry of entries) {
		if (!entry.isDir && CPP_EXTENSIONS.has(extensionOf(entry.name))) {
			return true;
		}
	}
	const childDirs = entries
		.filter((entry) => entry.isDir && !SKIP_DIRS.has(entry.name))
		.map((entry) => entry.path);
	const results = await Promise.all(
		childDirs.map((child) => scanForCpp(child, depth + 1, budget)),
	);
	return results.some(Boolean);
}
