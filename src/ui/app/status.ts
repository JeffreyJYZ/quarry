/** What the status bar shows after a save; a failure keeps the bar red until the next one. */
export type StatusText = { text: string; failed: boolean };

/** The two derived values the bar reads, kept out of the shell body so neither needs its own slot. */
export function shellStatus(
	report: { tools: readonly { source: string }[] } | null | undefined,
	saveStatus: StatusText | null,
): { missingTools: number; saveError: string | null } {
	const missingTools = report?.tools.filter((tool) => tool.source === "missing").length ?? 0;
	return { missingTools, saveError: saveStatus?.failed === true ? saveStatus.text : null };
}
