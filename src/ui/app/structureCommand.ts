import type { Command } from "@/ui/palette/CommandPalette";

/** Navigate ▸ File Structure: the palette row that opens the symbol popup. */
export function structureCommand(flags: { activePath: string | null; open: () => void }): Command {
	return {
		id: "file-structure",
		label: "Go to symbol in file",
		hint: "Cmd+F12",
		disabled: flags.activePath === null,
		disabledReason: "Open a file first",
		run: flags.open,
	};
}
