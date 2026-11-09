import { describe, expect, test } from "bun:test";
import { editingBindings } from "@/ui/editor/keymapEditing";
import type { KeymapDeps } from "@/ui/editor/keymapDeps";

const escapeBinding = (deps: KeymapDeps) =>
	editingBindings(deps).find((binding) => binding.key === "Escape");

describe("Escape in the editor", () => {
	test("closes a code-action menu opened after the view was mounted", () => {
		const closed: boolean[] = [];
		// The keymap is built once per mount, with the menu shut; the menu opens later, after mount.
		const deps = {
			renameOpen: false,
			codeMenuOpenRef: { current: false },
			setRenameOpen: () => {},
			setCodeMenuOpen: (open: boolean) => closed.push(open),
		} as unknown as KeymapDeps;
		const binding = escapeBinding(deps);
		expect(binding).toBeDefined();

		deps.codeMenuOpenRef.current = true;

		expect(binding?.run?.({} as never)).toBe(true);
		expect(closed).toEqual([false]);
	});

	test("stays out of the way when nothing is open", () => {
		const deps = {
			renameOpen: false,
			codeMenuOpenRef: { current: false },
			hideSig: () => {},
			occSeqRef: { current: 0 },
			occTimerRef: { current: null },
			clearOccurrences: () => {},
			searchOpenRef: { current: false },
		} as unknown as KeymapDeps;

		expect(escapeBinding(deps)?.run?.({} as never)).toBe(false);
	});
});
