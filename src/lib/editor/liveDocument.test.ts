import { beforeEach, describe, expect, test } from "bun:test";
import {
	currentDocumentLength,
	forgetAllDocumentLengths,
	forgetDocumentLength,
	trackDocumentLength,
} from "@/lib/editor/liveDocument";

describe("the live document length", () => {
	beforeEach(() => {
		forgetAllDocumentLengths();
	});
	test("is null until an editor mounts", () => {
		expect(currentDocumentLength()).toBeNull();
	});

	test("reports the last editor that changed, so a keystroke names its own document", () => {
		const left = {};
		const right = {};
		trackDocumentLength(left, 12);
		trackDocumentLength(right, 52);
		expect(currentDocumentLength()).toBe(52);
		trackDocumentLength(left, 13);
		expect(currentDocumentLength()).toBe(13);
	});

	test("forgetting the current editor falls back to the one still mounted", () => {
		const closing = {};
		const staying = {};
		trackDocumentLength(staying, 30);
		trackDocumentLength(closing, 61);
		forgetDocumentLength(closing);
		expect(currentDocumentLength()).toBe(30);
	});

	test("forgetting the last editor answers null rather than a closed document", () => {
		const only = {};
		trackDocumentLength(only, 61);
		forgetDocumentLength(only);
		expect(currentDocumentLength()).toBeNull();
	});
});
