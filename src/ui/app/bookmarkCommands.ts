import type { Command } from "@/ui/palette/CommandPalette";
import type { CommandContext } from "./commands";

/**
 * The two bookmark steps.
 *
 * They are one row each because that is how they are reached when the chord is not remembered, and
 * both go through the same walker the keyboard does — the row is not a second implementation.
 */
export function bookmarkCommands(
	context: CommandContext,
	flags: { root: string | null; count: number },
): Command[] {
	const empty = flags.count === 0;
	const reason = flags.root === null ? "Open a project first" : "No bookmarks in this project";
	return [
		{
			id: "next-bookmark",
			label: "Next bookmark",
			hint: "Cmd+Alt+N",
			disabled: flags.root === null || empty,
			disabledReason: reason,
			run: context.nextBookmark,
		},
		{
			id: "previous-bookmark",
			label: "Previous bookmark",
			hint: "Cmd+Alt+P",
			disabled: flags.root === null || empty,
			disabledReason: reason,
			run: context.previousBookmark,
		},
	];
}
