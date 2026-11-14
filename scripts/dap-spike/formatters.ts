/**
 * Second, independent session with rustup's lldb python providers loaded via `initCommands` — what
 * `rust-lldb` does.
 *
 * It answers whether a Rust visualizer shim is needed at all, or only a launch flag.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DapClient, DapError } from "./client";
import type { Json, Scratch } from "./state";

export async function probeRustFormatters(adapterPath: string, scratch: Scratch): Promise<Json> {
	const sysrootProbe = spawnSync("rustc", ["--print", "sysroot"], { encoding: "utf8" });
	let sysroot = sysrootProbe.stdout?.trim() ?? "";
	if (!sysroot) {
		const guess = "/opt/homebrew/opt/rustup/bin/rustc";
		sysroot =
			spawnSync(guess, ["--print", "sysroot"], { encoding: "utf8" }).stdout?.trim() ?? "";
	}
	if (!sysroot) return { error: "no rustc sysroot" };

	const etc = join(sysroot, "lib", "rustlib", "etc");
	const lookup = join(etc, "lldb_lookup.py");
	const commands = join(etc, "lldb_commands");
	if (!existsSync(lookup)) return { error: `missing ${lookup}`, sysroot };

	const initCommands = [`command script import ${lookup}`];
	if (existsSync(commands)) initCommands.push(`command source ${commands}`);

	const client = new DapClient(adapterPath);
	const out: Json = { sysroot, initCommands };
	try {
		await client.send("initialize", {
			clientID: "quarry-dap-spike",
			clientName: "quarry dap spike",
			adapterID: "lldb",
			linesStartAt1: true,
			pathFormat: "path",
			supportsVariableType: true,
			supportsMemoryReferences: true,
		});
		await client.send("launch", {
			program: scratch.binary,
			args: [],
			cwd: scratch.dir,
			stopOnEntry: true,
			terminal: "console",
			initCommands,
		});
		await client.send("setBreakpoints", {
			source: { name: "main.rs", path: scratch.source },
			breakpoints: [{ line: scratch.breakpointLine }],
			sourceModified: false,
		});
		await client.send("configurationDone", {});

		let stopped = await client.waitForEvent((e) => e.event === "stopped");
		let threadId = Number(stopped.body?.threadId ?? 0);
		let frames: Array<Json> = [];
		for (let attempt = 0; attempt < 8; attempt += 1) {
			const stack = await client.send("stackTrace", { threadId, startFrame: 0, levels: 5 });
			frames = (stack.stackFrames as Array<Json> | undefined) ?? [];
			const top = frames[0];
			const topSource = String((top?.source as Json | undefined)?.path ?? "");
			if (Number(top?.line) === scratch.breakpointLine && topSource.endsWith("main.rs"))
				break;
			await client.send("continue", { threadId });
			stopped = await client.waitForEvent((e) => e.event === "stopped");
			threadId = Number(stopped.body?.threadId ?? threadId);
		}

		const scopesResult = await client.send("scopes", { frameId: Number(frames[0]?.id ?? 0) });
		const scopes = (scopesResult.scopes as Array<Json> | undefined) ?? [];
		const localsScope =
			scopes.find((s) => s.presentationHint === "locals") ??
			scopes.find((s) => /local/i.test(String(s.name)));
		if (!localsScope) throw new DapError("no locals scope with formatters loaded");
		const variablesResult = await client.send("variables", {
			variablesReference: Number(localsScope.variablesReference),
		});
		const locals = ((variablesResult.variables as Array<Json> | undefined) ?? []).map((v) => ({
			name: String(v.name),
			value: String(v.value),
			type: String(v.type ?? ""),
			variablesReference: Number(v.variablesReference ?? 0),
		}));
		const pick = (name: string) => locals.find((l) => l.name === name);
		out.vec = pick("v")?.value ?? null;
		out.string = pick("s")?.value ?? null;
		out.option = pick("o")?.value ?? null;
		out.pointer = pick("raw")?.value ?? null;
		const children = async (ref: number | undefined) => {
			if (!ref || ref <= 0) return [] as Array<{ name: string; value: string }>;
			const result = await client.send("variables", { variablesReference: ref });
			return ((result.variables as Array<Json> | undefined) ?? []).map((c) => ({
				name: String(c.name),
				value: String(c.value),
			}));
		};
		out.vecChildren = await children(pick("v")?.variablesReference);
		out.stringChildren = await children(pick("s")?.variablesReference);

		try {
			await client.send("disconnect", { terminateDebuggee: true, restart: false }, 5_000);
		} catch {
			// killed below
		}
	} catch (error) {
		out.error = error instanceof Error ? error.message : String(error);
		out.stderr = client.stderr().split("\n").slice(-4);
	} finally {
		client.kill();
	}
	return out;
}
