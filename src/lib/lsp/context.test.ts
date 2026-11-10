import { beforeEach, describe, expect, test } from "bun:test";
import {
	lspContext,
	sessionForContext,
	setLspContext,
	subscribeLspContext,
} from "@/lib/lsp/context";

beforeEach(() => {
	setLspContext(null, new Set());
});

describe("the language-server context", () => {
	test("a listener hears a real change", () => {
		const heard: string[] = [];
		subscribeLspContext(() => heard.push("change"));

		setLspContext("/p", new Set(["clangd"]));

		expect(heard.length).toBe(1);
		expect(sessionForContext("/p/src/main.cpp")).toBe("clangd::/p");
	});

	test("an identical set notifies nobody and keeps the same snapshot", () => {
		setLspContext("/p", new Set(["clangd"]));
		const before = lspContext();
		const heard: string[] = [];
		subscribeLspContext(() => heard.push("change"));

		setLspContext("/p", new Set(["clangd"]));

		expect(heard.length).toBe(0);
		expect(lspContext()).toBe(before);
	});

	test("a server joining or leaving notifies, and so does a new root", () => {
		setLspContext("/p", new Set(["clangd"]));
		const heard: string[] = [];
		subscribeLspContext(() => heard.push("change"));

		setLspContext("/p", new Set(["clangd", "rust-analyzer"]));
		setLspContext("/p", new Set(["clangd"]));
		setLspContext("/other", new Set(["clangd"]));

		expect(heard.length).toBe(3);
	});

	test("unsubscribe stops the listener", () => {
		const heard: string[] = [];
		const off = subscribeLspContext(() => heard.push("change"));
		off();

		setLspContext("/p", new Set(["clangd"]));

		expect(heard.length).toBe(0);
	});

	test("a path no running server serves has no session, and one that does has its own", () => {
		setLspContext("/p", new Set(["rust-analyzer"]));

		expect(sessionForContext("/p/src/main.cpp")).toBe(null);
		expect(sessionForContext("/p/src/main.rs")).toBe("rust-analyzer::/p");
	});
});
