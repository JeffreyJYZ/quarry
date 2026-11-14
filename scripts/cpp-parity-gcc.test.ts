import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findGcc, NO_GCC } from "./cpp-parity/gcc";

test("a machine with no GCC names the reason rather than a compiler", () => {
	expect(findGcc([])).toBeNull();
	expect(NO_GCC).toContain("brew install gcc");
});

test("a driver called g++ that is not GCC is not a second toolchain", () => {
	const dir = mkdtempSync(join(tmpdir(), "quarry-gcc-"));
	writeFileSync(join(dir, "g++"), "#!/bin/sh\necho 'Apple clang version 21.0.0'\n", {
		mode: 0o755,
	});
	writeFileSync(join(dir, "gcc"), "#!/bin/sh\necho 'Apple clang version 21.0.0'\n", {
		mode: 0o755,
	});
	expect(findGcc([dir])).toBeNull();
});
