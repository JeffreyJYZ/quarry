import { describe, expect, test } from "bun:test";
import type { DapVariable } from "@/project/api";
import { pinKey, walkPin } from "./watch";

function v(name: string, ref = 0, type: string | null = null): DapVariable {
	return {
		name,
		value: `${name}-value`,
		typeName: type,
		variablesReference: ref,
		memoryReference: null,
	};
}

describe("walkPin", () => {
	test("top-level", () => {
		const children = new Map<number, DapVariable[]>([[1, [v("a"), v("b")]]]);
		const result = walkPin(children, { scopeReference: 1, name: "b", path: [] });
		expect(result?.name).toBe("b");
	});

	test("nested path", () => {
		const inner = [v("x", 0, "i32")];
		const children = new Map<number, DapVariable[]>([
			[1, [v("outer", 2)]],
			[2, inner],
		]);
		const result = walkPin(children, {
			scopeReference: 1,
			name: "x",
			path: ["outer"],
		});
		expect(result?.name).toBe("x");
		expect(result?.typeName).toBe("i32");
	});

	test("missing segment returns null", () => {
		const children = new Map<number, DapVariable[]>([[1, [v("outer", 2)]]]);
		const result = walkPin(children, {
			scopeReference: 1,
			name: "x",
			path: ["missing"],
		});
		expect(result).toBeNull();
	});

	test("missing leaf returns null", () => {
		const children = new Map<number, DapVariable[]>([[1, [v("outer", 2)]]]);
		const result = walkPin(children, { scopeReference: 1, name: "nope", path: [] });
		expect(result).toBeNull();
	});

	test("unexpanded intermediate returns null", () => {
		const children = new Map<number, DapVariable[]>([[1, [v("outer", 2)]]]);
		const result = walkPin(children, {
			scopeReference: 1,
			name: "x",
			path: ["outer"],
		});
		expect(result).toBeNull();
	});

	test("pinKey stable", () => {
		expect(pinKey({ scopeReference: 1, name: "x", path: ["a"] })).toBe("1:a:x");
	});
});
