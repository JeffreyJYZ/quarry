import { describe, expect, test } from "bun:test";
import { findUrls } from "@/lib/terminal/urls";

describe("findUrls", () => {
	test("finds one address and reports its offsets", () => {
		const text = "build log at https://example.com/x done";
		expect(findUrls(text)).toEqual([
			{ start: 13, end: 13 + "https://example.com/x".length, url: "https://example.com/x" },
		]);
	});

	test("keeps a query string, a fragment and a port", () => {
		const text = "http://localhost:5173/a?b=1#c";
		expect(findUrls(text)[0]?.url).toBe("http://localhost:5173/a?b=1#c");
	});

	test("drops a full stop that ends the sentence", () => {
		expect(findUrls("see https://example.com/a.")[0]?.url).toBe("https://example.com/a");
	});

	test("drops a closing parenthesis the address did not open", () => {
		expect(findUrls("(see https://example.com/a)")[0]?.url).toBe("https://example.com/a");
	});

	test("keeps a closing parenthesis the address opened", () => {
		expect(findUrls("https://en.wikipedia.org/wiki/Rust_(language)")[0]?.url).toBe(
			"https://en.wikipedia.org/wiki/Rust_(language)",
		);
	});

	test("finds two addresses on one line", () => {
		const urls = findUrls("http://a.test/x and https://b.test/y").map((found) => found.url);
		expect(urls).toEqual(["http://a.test/x", "https://b.test/y"]);
	});

	test("ignores a bare host, a scheme with nothing after it and plain text", () => {
		expect(findUrls("www.example.com http:// ftp://example.com")).toEqual([]);
	});

	test("finds an address wrapped in angle brackets and leaves them out", () => {
		expect(findUrls("<https://example.com/a>")[0]?.url).toBe("https://example.com/a");
	});
});
