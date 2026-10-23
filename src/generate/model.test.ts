import { describe, expect, test } from "bun:test";
import { generateItems } from "@/generate/model";

const RUST = [
	"pub struct Point {",
	"    pub x: f64,",
	"    pub y: f64,",
	"}",
	"",
	"fn distance(a: &Point) -> f64 {",
	"    0.0",
	"}",
].join("\n");

describe("generateItems for Rust", () => {
	test("offers an impl built from the enclosing struct's fields", () => {
		const items = generateItems("/p/src/main.rs", RUST, 1);
		const impl = items.find((item) => item.id === "impl-Point");
		expect(impl).toBeDefined();
		expect(impl?.insert).toBe("end");
		expect(impl?.text).toContain("pub fn new(x: f64, y: f64) -> Self");
		expect(impl?.text).toContain("Self { x, y }");
	});

	test("does not offer an impl that already exists", () => {
		const withImpl = `${RUST}\nimpl Point {\n    fn zero() -> Self { Self { x: 0.0, y: 0.0 } }\n}\n`;
		const items = generateItems("/p/src/main.rs", withImpl, 1);
		expect(items.some((item) => item.id === "impl-Point")).toBe(false);
	});

	test("a caret outside the braces gets no impl", () => {
		const items = generateItems("/p/src/main.rs", RUST, 6);
		expect(items.some((item) => item.id.startsWith("impl-"))).toBe(false);
	});

	test("offers the test module until one exists", () => {
		expect(generateItems("/p/src/main.rs", RUST, 0).some((item) => item.id === "tests")).toBe(
			true,
		);
		const withTests = `${RUST}\n#[cfg(test)]\nmod tests {}\n`;
		expect(
			generateItems("/p/src/main.rs", withTests, 0).some((item) => item.id === "tests"),
		).toBe(false);
	});
});

const CPP = [
	"#include <string>",
	"",
	"class Greeter {",
	"public:",
	"    std::string name;",
	"    int count;",
	"};",
].join("\n");

describe("generateItems for C and C++", () => {
	test("offers a constructor from the enclosing class's fields", () => {
		const items = generateItems("/p/src/main.cpp", CPP, 4);
		const ctor = items.find((item) => item.id === "ctor-Greeter");
		expect(ctor).toBeDefined();
		expect(ctor?.insert).toBe("caret");
		expect(ctor?.text).toContain("Greeter(std::string name, int count)");
		expect(ctor?.text).toContain("name(name)");
	});

	test("does not offer a constructor that already exists", () => {
		const withCtor = CPP.replace(
			"public:",
			"public:\n    Greeter(std::string value, int amount);",
		);
		const items = generateItems("/p/src/main.cpp", withCtor, 5);
		expect(items.some((item) => item.id.startsWith("ctor-"))).toBe(false);
	});

	test("offers main until the file has one", () => {
		expect(generateItems("/p/src/main.cpp", CPP, 0).some((item) => item.id === "main")).toBe(
			true,
		);
		const withMain = `${CPP}\nint main() {\n    return 0;\n}\n`;
		expect(
			generateItems("/p/src/main.cpp", withMain, 0).some((item) => item.id === "main"),
		).toBe(false);
	});

	test("other languages get nothing", () => {
		expect(generateItems("/p/README.md", "# hi", 0)).toEqual([]);
	});
});
