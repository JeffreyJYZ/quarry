import { afterEach, describe, expect, test } from "bun:test";
import type { DocumentSymbol as LspSymbol } from "@/lib/project/api";
import { cleanup, render } from "@/test/render";
import StructurePalette from "@/ui/structure/StructurePalette";

/**
 * The highlight must be right in the frame the rows appear, not one commit later.
 *
 * On the runner the load resolves outside `act`, so React commits the rows, the browser paints them
 * with the default row highlighted, and only then does the seeding effect move the highlight. That
 * intermediate frame is what a person sees flicker and what the old test caught only by luck.
 *
 * Forced here: the load resolves on a real macrotask, so the rows commit on its own, and every
 * committed frame is recorded instead of the final one.
 */
type Frame = { names: string[]; active: string | null };

function sym(name: string, line: number): LspSymbol {
	return {
		name,
		kind: 12,
		range: { start: { line, character: 0 }, end: { line: line + 1, character: 1 } },
		depth: 0,
	};
}

/** Record the class of every row each time the list changes, while the tree is still live. */
function watch(): { frames: Frame[]; stop: () => void } {
	const frames: Frame[] = [];
	const seen = () => {
		const rows = [...document.querySelectorAll(".goto-row")];
		if (rows.length === 0) return;
		const names = rows.map((row) => row.querySelector(".goto-label")?.textContent ?? "");
		const active = rows.find((row) => row.classList.contains("active"));
		const frame: Frame = {
			names,
			active: active?.querySelector(".goto-label")?.textContent ?? null,
		};
		const last = frames.at(-1);
		if (last !== undefined && last.active === frame.active) return;
		frames.push(frame);
	};
	const observer = new MutationObserver(seen);
	observer.observe(document.body, { childList: true, subtree: true, attributes: true });
	return { frames, stop: () => observer.disconnect() };
}

afterEach(() => {
	cleanup();
});

describe("the File Structure highlight", () => {
	test("is already the caret's symbol in the first frame that has rows", async () => {
		const load = () =>
			new Promise<LspSymbol[]>((resolve) => {
				setTimeout(() => resolve([sym("main", 0), sym("helper", 4)]), 0);
			});
		const recorder = watch();
		render(
			<StructurePalette
				activePath="/p/src/lib.rs"
				session="rust-analyzer::/p"
				cursor={{ line: 4, character: 0 }}
				onNavigate={() => {}}
				onClose={() => {}}
				load={load}
			/>,
		);
		await new Promise((resolve) => setTimeout(resolve, 50));
		recorder.stop();

		const withRows = recorder.frames.filter((frame) => frame.names.length === 2);
		expect(withRows.length).toBeGreaterThan(0);
		expect(withRows.map((frame) => frame.active)).toEqual(withRows.map(() => "helper"));
		// The final frame is what the assertion above is about, so re-read it live too.
		const buttons = [...document.querySelectorAll(".goto-row")];
		expect(buttons[1]?.className).toContain("active");
		expect(buttons[0]?.className).not.toContain("active");
	});
});
