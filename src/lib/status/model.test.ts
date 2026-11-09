import { describe, expect, test } from "bun:test";
import { type ServerStates, serverSurface, statusChip } from "@/lib/status/model";

const ABSENT: ServerStates = {
	"rust-analyzer": { phase: "absent" },
	clangd: { phase: "absent" },
};

const STARTING: ServerStates = {
	"rust-analyzer": { phase: "starting" },
	clangd: { phase: "absent" },
};

const READY: ServerStates = {
	"rust-analyzer": {
		phase: "ready",
		status: { root: "/p", server: "rust-analyzer", version: "1.85.0" },
	},
	clangd: { phase: "absent" },
};

const ENDED: ServerStates = {
	"rust-analyzer": { phase: "ended" },
	clangd: { phase: "absent" },
};

/** The chip for a `.rs` file under `states`, with the build and session quiet unless overridden. */
function chip(
	states: ServerStates,
	overrides: {
		building?: boolean;
		running?: boolean;
		kind?: "rust-analyzer" | "clangd" | null;
	} = {},
) {
	return statusChip({
		server: serverSurface(
			overrides.kind === undefined ? "rust-analyzer" : overrides.kind,
			states,
		),
		building: overrides.building ?? false,
		running: overrides.running ?? false,
	});
}

describe("serverSurface", () => {
	test("a kind the root does not run is absent, even while the other kind runs", () => {
		expect(serverSurface("clangd", READY).phase).toBe("absent");
		expect(serverSurface("clangd", READY).name).toBeNull();
	});

	test("a file no server serves has no surface", () => {
		expect(serverSurface(null, READY).phase).toBe("absent");
	});

	test("a ready server carries its name", () => {
		expect(serverSurface("rust-analyzer", READY)).toEqual({
			phase: "ready",
			name: "rust-analyzer",
		});
	});
});

describe("statusChip", () => {
	test("no server for the file at all: no chip, never a claim that it is starting", () => {
		expect(chip(ABSENT)).toBeNull();
	});

	test("a server still coming up says it is starting", () => {
		expect(chip(STARTING)?.label).toBe("lsp starting");
	});

	test("a ready server names itself", () => {
		expect(chip(READY)?.label).toBe("rust-analyzer");
	});

	// The wrong case this module exists for: the chip kept claiming progress after the server died.
	test("a server that died while starting stops claiming to start", () => {
		expect(chip(ENDED)?.label).not.toBe("lsp starting");
	});

	test("a server that was ready and then died is unavailable, not its old name", () => {
		expect(chip(ENDED)).toEqual({
			label: "lsp unavailable",
			title: "Language server stopped",
		});
	});

	test("a build in flight is reported before the server", () => {
		expect(chip(READY, { building: true })?.label).toBe("building");
	});

	test("a cancelled build leaves no building label behind", () => {
		expect(chip(READY, { building: false })?.label).toBe("rust-analyzer");
	});

	test("a live session is reported while it lasts", () => {
		expect(chip(READY, { running: true })?.label).toBe("running");
	});

	test("a restart that finished names the server again", () => {
		// The state a settled restart leaves behind is ready and quiet — never the pre-restart name
		// half-way through, which is what a chip reading a stale status reported.
		expect(chip(STARTING, { building: false, running: false })?.label).toBe("lsp starting");
		expect(chip(READY, { building: false, running: false })?.label).toBe("rust-analyzer");
	});
});
