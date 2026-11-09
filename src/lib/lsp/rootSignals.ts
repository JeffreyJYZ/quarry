import { useEffect, useState } from "react";
import { isCppPath } from "@/lib/consts/extensions";
import type { RootSignals } from "@/lib/lsp/served";
import { listDir } from "@/lib/project/api";
import { fileName } from "@/lib/project/paths";

const SKIP_DIRS = new Set(["target", "node_modules", ".git", "build", "out"]);
const MAX_DEPTH = 4;
const MAX_DIRS = 64;

/** Directories a compiler database is usually generated into, checked one level deep only. */
const BUILD_DIR = /^(?:build|cmake-build-.*)$/;
const MAX_BUILD_DIRS = 4;

/** Files whose appearance changes what a root needs. */
const MARKERS = new Set(["Cargo.toml", "CMakeLists.txt", "compile_commands.json"]);

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
const subscribers = new Map<string, Set<() => void>>();

/** Whether a changed-path batch can change a root's signals: a marker was created or removed. */
export function marksRootSignals(paths: string[]): boolean {
	return paths.some((path) => MARKERS.has(fileName(path)));
}

/**
 * Drops a root's cached signals and re-probes every live `useRootSignals` for it.
 *
 * The cache is keyed on the root alone and lives as long as the module, so without this a marker
 * created after the project was opened would never start its server until the app reloaded.
 */
export function invalidateRootSignals(root: string): void {
	cache.delete(root);
	const waiting = subscribers.get(root);
	if (waiting === undefined) return;
	for (const notify of waiting) notify();
}

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
		let entries: Awaited<ReturnType<typeof listDir>> = [];
		try {
			entries = await listDir(root);
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
		if (!hasCompileCommands) {
			hasCompileCommands = await compileCommandsInBuildDir(entries);
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

/**
 * A compiler database one level down, in `build/` or a `cmake-build-*` directory.
 *
 * The backend types such a root as `CompileCommands`, so this probe has to agree or no clangd
 * session starts for it. It is one bounded level, never a repo sweep.
 */
async function compileCommandsInBuildDir(
	entries: Awaited<ReturnType<typeof listDir>>,
): Promise<boolean> {
	const dirs = entries
		.filter((entry) => entry.isDir && BUILD_DIR.test(entry.name))
		.slice(0, MAX_BUILD_DIRS);
	for (const dir of dirs) {
		let inner: Awaited<ReturnType<typeof listDir>> = [];
		try {
			inner = await listDir(dir.path);
		} catch {
			continue;
		}
		if (inner.some((entry) => !entry.isDir && entry.name === "compile_commands.json")) {
			return true;
		}
	}
	return false;
}

export function useRootSignals(root: string | null): RootSignals | null {
	const [signals, setSignals] = useState<RootSignals | null>(null);
	const [revision, setRevision] = useState(0);
	useEffect(() => {
		if (root === null) return;
		const notify = () => setRevision((current) => current + 1);
		const waiting = subscribers.get(root);
		if (waiting === undefined) subscribers.set(root, new Set([notify]));
		else waiting.add(notify);
		return () => {
			const set = subscribers.get(root);
			set?.delete(notify);
			if (set !== undefined && set.size === 0) subscribers.delete(root);
		};
	}, [root]);
	useEffect(() => {
		// `revision` is a re-probe trigger, never a value the probe reads: referencing it keeps the
		// dependency honest and reruns the probe after the cache was invalidated.
		void revision;
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
	}, [root, revision]);
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
		if (!entry.isDir && isCppPath(entry.name)) {
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
