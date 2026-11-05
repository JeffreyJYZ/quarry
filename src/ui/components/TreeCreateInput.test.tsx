import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CreateInputRow } from "@/ui/components/TreeCreateInput";

function row(depth: number): string {
	return renderToStaticMarkup(
		CreateInputRow({
			depth,
			parent: "/p/src",
			kind: "create-file",
			onCommit: () => {},
			onCancel: () => {},
		}),
	);
}

describe("the new-file row", () => {
	test("carries the disclosure slot, so the field starts where its entry will", () => {
		expect(row(1)).toContain('class="tree-caret-slot"');
	});

	test("indents by depth, not by the project root", () => {
		expect(row(0)).toContain("padding-left:8px");
		expect(row(1)).toContain("padding-left:20px");
		expect(row(2)).toContain("padding-left:32px");
	});

	test("names the kind it is creating", () => {
		expect(row(1)).toContain('placeholder="new file"');
	});
});
