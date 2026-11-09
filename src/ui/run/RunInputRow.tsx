import { useState } from "react";

export type RunInputRowProps = {
	/** Whether a program is running and can accept a line. */
	canSend: boolean;
	/** Sends one line to the program's stdin. */
	onSend: (line: string) => void;
};

/**
 * The one-line input under the run output.
 *
 * A single-input form is what makes Enter submit without a key handler, and the row owns its own
 * draft so typing does not re-render the output list above it.
 */
export default function RunInputRow({ canSend, onSend }: RunInputRowProps) {
	const [input, setInput] = useState("");
	return (
		<form
			className="run-log-input"
			onSubmit={(event) => {
				event.preventDefault();
				if (!canSend) return;
				onSend(input);
				setInput("");
			}}
		>
			<input
				className="run-log-input-field"
				aria-label="Program input"
				placeholder={canSend ? "Type input, press Enter" : "No program running"}
				value={input}
				disabled={!canSend}
				onChange={(event) => setInput(event.target.value)}
			/>
		</form>
	);
}
