import { describe, expect, test } from "bun:test";
import {
	fetchReleaseNotes,
	notesTagFor,
	parseNotes,
	shouldShowWhatsNew,
	withTimeout,
} from "@/lib/updates/notes";

describe("notesTagFor", () => {
	test("an alpha maps to the tag release-local publishes", () => {
		expect(notesTagFor("0.1.0-alpha.76")).toBe("quarry-alpha76");
	});

	test("a stable version maps to v<version>", () => {
		expect(notesTagFor("1.2.3")).toBe("v1.2.3");
	});
});

describe("parseNotes", () => {
	test("headings, bullets and bold lose their markers", () => {
		const body = ["## Changes", "", "- **feat**: restart lsp", "- fix: tree indent"].join("\n");
		expect(parseNotes(body)).toEqual(["Changes", "feat: restart lsp", "fix: tree indent"]);
	});

	test("fences are dropped whole", () => {
		const body = ["- one", "```", "code here", "```", "- two"].join("\n");
		expect(parseNotes(body)).toEqual(["one", "two"]);
	});

	test("numbered entries keep their text", () => {
		expect(parseNotes("1. first\n2. second")).toEqual(["first", "second"]);
	});

	test("an empty body yields no lines", () => {
		expect(parseNotes("\n\n  \n")).toEqual([]);
	});
});

describe("shouldShowWhatsNew", () => {
	test("a first install stays quiet", () => {
		expect(shouldShowWhatsNew("0.1.0-alpha.76", null)).toBe(false);
	});

	test("the launch after an update shows the notes", () => {
		expect(shouldShowWhatsNew("0.1.0-alpha.76", "0.1.0-alpha.75")).toBe(true);
	});

	test("the same version does not show again", () => {
		expect(shouldShowWhatsNew("0.1.0-alpha.76", "0.1.0-alpha.76")).toBe(false);
	});
});

describe("withTimeout", () => {
	test("a promise that answers in time passes through", async () => {
		await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
	});

	test("a promise that never settles is rejected, so the caller can stop waiting", async () => {
		await expect(withTimeout(new Promise<number>(() => {}), 5)).rejects.toThrow("timed out");
	});
});

describe("fetchReleaseNotes", () => {
	const okBody = { ok: true, json: async () => ({ body: "- one\n- two" }) };

	test("reads the release the version maps to", async () => {
		let asked = "";
		const notes = await fetchReleaseNotes("0.1.0-alpha.77", (url) => {
			asked = url;
			return Promise.resolve(okBody);
		});
		expect(asked).toContain("/releases/tags/quarry-alpha77");
		expect(notes).toEqual(["one", "two"]);
	});

	test("a missing release is null, not a throw", async () => {
		const notes = await fetchReleaseNotes("9.9.9", () =>
			Promise.resolve({ ok: false, json: async () => ({}) }),
		);
		expect(notes).toBeNull();
	});

	test("a fetch that never answers resolves to null instead of hanging the panel", async () => {
		const notes = await fetchReleaseNotes("0.1.0-alpha.77", () => new Promise(() => {}), 5);
		expect(notes).toBeNull();
	});

	test("a body that is not a string is null", async () => {
		const notes = await fetchReleaseNotes("0.1.0-alpha.77", () =>
			Promise.resolve({ ok: true, json: async () => ({ body: 42 }) }),
		);
		expect(notes).toBeNull();
	});
});
