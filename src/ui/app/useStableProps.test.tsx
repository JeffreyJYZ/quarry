import { describe, expect, test } from "bun:test";
import type { DebugController } from "@/lib/debug/session";
import type { GitStatus } from "@/lib/project/api";
import type { FileBuffer } from "@/lib/project/buffer";
import { mount } from "@/test/render";
import {
	type DisasmSplit,
	type EditorReveal,
	useChanges,
	useDisasmSplit,
	useEditorReveal,
	useOpenPaths,
} from "@/ui/app/useStableProps";

const buffer = (path: string): FileBuffer => ({ path, name: path, text: "", loaded: "" });
const noop = () => {};

/** A stopped debugger: the selected frame is the second one, at 0x20. */
const stopped = {
	sessionId: "s1",
	stopView: {
		frameId: 2,
		frames: [
			{ id: 1, instructionPointer: "0x10" },
			{ id: 2, instructionPointer: "0x20" },
		],
	},
} as unknown as DebugController;

function OpenPathsProbe({
	buffers,
	tick,
	seen,
}: {
	buffers: FileBuffer[];
	tick: number;
	seen: Set<string>[];
}) {
	seen.push(useOpenPaths(buffers));
	return <span>{tick}</span>;
}

function RevealProbe({
	target,
	token,
	tick,
	seen,
}: {
	target: { line: number; character: number } | null;
	token: number;
	tick: number;
	seen: EditorReveal[];
}) {
	seen.push(useEditorReveal(target, token));
	return <span>{tick}</span>;
}

function DisasmProbe({
	open,
	width,
	tick,
	seen,
}: {
	open: boolean;
	width: number;
	tick: number;
	seen: DisasmSplit[];
}) {
	seen.push(useDisasmSplit({ open, width, debug: stopped, onWidthChange: noop, setOpen: noop }));
	return <span>{tick}</span>;
}

function ChangesProbe({
	status,
	tick,
	seen,
}: {
	status: GitStatus | null;
	tick: number;
	seen: Record<string, string>[];
}) {
	seen.push(useChanges(status));
	return <span>{tick}</span>;
}

describe("useOpenPaths", () => {
	test("survives an unrelated render and is replaced when the buffers change", () => {
		const seen: Set<string>[] = [];
		const buffers = [buffer("a"), buffer("b")];
		const rerender = mount(<OpenPathsProbe buffers={buffers} tick={0} seen={seen} />);
		rerender(<OpenPathsProbe buffers={buffers} tick={1} seen={seen} />);
		expect(seen[1]).toBe(seen[0]);

		rerender(<OpenPathsProbe buffers={[...buffers, buffer("c")]} tick={1} seen={seen} />);
		expect(seen[2]).not.toBe(seen[1]);
		expect(seen[2]).toEqual(new Set(["a", "b", "c"]));
	});
});

describe("useEditorReveal", () => {
	test("survives an unrelated render and is replaced by the target or its token", () => {
		const seen: EditorReveal[] = [];
		const target = { line: 3, character: 1 };
		const rerender = mount(<RevealProbe target={target} token={0} tick={0} seen={seen} />);
		rerender(<RevealProbe target={target} token={0} tick={1} seen={seen} />);
		expect(seen[1]).toBe(seen[0]);
		expect(seen[1]).toEqual({ line: 3, character: 1, token: 0 });

		rerender(<RevealProbe target={target} token={1} tick={2} seen={seen} />);
		expect(seen[2]).not.toBe(seen[1]);
		expect(seen[2]?.token).toBe(1);

		rerender(<RevealProbe target={{ line: 9, character: 0 }} token={1} tick={3} seen={seen} />);
		expect(seen[3]).not.toBe(seen[2]);
		expect(seen[3]?.line).toBe(9);
	});
});

describe("useDisasmSplit", () => {
	test("survives an unrelated render, follows the frame, and is replaced by the width", () => {
		const seen: DisasmSplit[] = [];
		const rerender = mount(<DisasmProbe open width={320} tick={0} seen={seen} />);
		expect(seen[0]?.address).toBe("0x20");
		expect(seen[0]?.frameId).toBe(2);

		rerender(<DisasmProbe open width={320} tick={1} seen={seen} />);
		expect(seen[1]).toBe(seen[0]);

		rerender(<DisasmProbe open width={480} tick={2} seen={seen} />);
		expect(seen[2]).not.toBe(seen[1]);
		expect(seen[2]?.width).toBe(480);

		rerender(<DisasmProbe open={false} width={480} tick={3} seen={seen} />);
		expect(seen[3]).toBeNull();
	});
});

describe("useChanges", () => {
	test("survives an unrelated render and is replaced by a new status read", () => {
		const status: GitStatus = {
			branch: "main",
			entries: [{ path: "a.ts", status: "modified", staged: false }],
			ahead: 0,
			behind: 0,
		};
		const seen: Record<string, string>[] = [];
		const rerender = mount(<ChangesProbe status={status} tick={0} seen={seen} />);
		rerender(<ChangesProbe status={status} tick={1} seen={seen} />);
		expect(seen[1]).toBe(seen[0]);
		expect(seen[1]).toEqual({ "a.ts": "modified" });

		const next: GitStatus = {
			...status,
			entries: [{ path: "b.ts", status: "added", staged: true }],
		};
		rerender(<ChangesProbe status={next} tick={2} seen={seen} />);
		expect(seen[2]).not.toBe(seen[1]);
		expect(seen[2]).toEqual({ "b.ts": "added" });
	});
});
