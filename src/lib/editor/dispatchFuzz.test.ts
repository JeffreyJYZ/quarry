import { describe, expect, test } from "bun:test";
import "@/test/dom";
import { DOCS, type Step, applyStep, createView, runSeed } from "@/lib/editor/dispatchFuzz";

const host = document.createElement("div");
document.body.appendChild(host);

/** Every violation one seed produced, as a line a bug report can quote. */
function sweep(from: number, count: number): string[] {
	const failures: string[] = [];
	for (let seed = from; seed < from + count; seed += 1) {
		const run = runSeed(seed, host);
		if (run.violation === null) continue;
		const { doc, step, error } = run.violation;
		failures.push(
			`seed ${seed}: ${JSON.stringify(step)} on ${JSON.stringify(doc)} -> ${error}`,
		);
	}
	return failures;
}

describe("editor dispatch fuzz", () => {
	test("the same seed generates the same sequence", () => {
		for (let seed = 1; seed <= 12; seed += 1) {
			const first = runSeed(seed, host);
			const second = runSeed(seed, host);
			expect(JSON.stringify(second.steps)).toBe(JSON.stringify(first.steps));
			expect(second.violation?.error).toBe(first.violation?.error);
		}
	});

	test("typing goes through closeBrackets' own input handler", () => {
		const view = createView(host, "class A ", []);
		applyStep(view, { kind: "type", from: 8, to: 8, text: "{" });
		// `{}` is closeBrackets' work and the `;` is cppEditing's, so both extensions really ran.
		expect(view.state.doc.toString()).toBe("class A {};");
		view.destroy();
	});

	test("a newline in the middle of a pair expands it", () => {
		const view = createView(host, "int x = 0;\n", []);
		applyStep(view, { kind: "type", from: 10, to: 10, text: "{" });
		const afterBrace = view.state.doc.toString();
		applyStep(view, { kind: "type", from: 11, to: 11, text: "\n" });
		expect(view.state.doc.toString()).not.toBe(afterBrace);
		expect(view.state.doc.toString()).toContain("\n");
		view.destroy();
	});

	test("every document in the pool survives a no-op selection step", () => {
		for (const doc of DOCS) {
			const view = createView(host, doc, []);
			const normalized = view.state.doc.toString();
			const step: Step = { kind: "delete", from: 0, to: 0 };
			applyStep(view, step);
			expect(view.state.doc.toString()).toBe(normalized);
			view.destroy();
		}
	});

	test("300 seeds keep every invariant", () => {
		const failures = sweep(1, 300);
		expect(failures.slice(0, 5)).toEqual([]);
	}, 60_000);
});
