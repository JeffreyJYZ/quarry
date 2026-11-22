#!/usr/bin/env bun
/**
 * Print the release notes for a tag without building or publishing anything.
 *
 * Usage: bun scripts/release-notes.ts --tag quarry-alpha105 [--commit sha]
 * The commit defaults to the tag itself; the range is the last tag reachable from it.
 */

import { notesForTag } from "./release-local/notes-sources";
import { arg, fail } from "./release-local/process";

const tag = arg("--tag");
if (tag === null) fail("usage: bun scripts/release-notes.ts --tag quarry-alphaN [--commit sha]");

const commit = arg("--commit") ?? tag;
try {
	console.log(notesForTag(tag, commit));
} catch (error) {
	fail(error instanceof Error ? error.message : String(error));
}
