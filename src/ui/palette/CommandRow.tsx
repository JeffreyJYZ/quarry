import type { Command } from "@/ui/palette/CommandPalette";

/** One command row: label, then the accelerator or the reason it cannot run. */
export default function CommandRow({
	command,
	index,
	active,
	onRun,
	onHover,
}: {
	command: Command;
	index: number;
	active: boolean;
	onRun: () => void;
	onHover: () => void;
}) {
	const disabled = command.disabled === true;
	return (
		<button
			type="button"
			className={
				disabled ? "command-row disabled" : active ? "command-row active" : "command-row"
			}
			data-index={index}
			disabled={disabled}
			title={disabled ? command.disabledReason : undefined}
			onClick={onRun}
			onMouseEnter={onHover}
		>
			<span className="command-label">{command.label}</span>
			{disabled && command.disabledReason !== undefined ? (
				<span className="command-hint disabled-reason">{command.disabledReason}</span>
			) : command.hint ? (
				<span className="command-hint">{command.hint}</span>
			) : null}
		</button>
	);
}
