import { useEffect, useRef, useState } from "react";
import { parseLine } from "@/lib/editor/linePrompt";

/**
 * Jump to a line number in the active file.
 *
 * It is its own prompt rather than a fourth "go to" mode: the other three ask a language server and
 * list answers, while this one takes a number and says nothing back. The clamping rule lives in
 * `parseLine`, so it is tested without a browser.
 */
export default function LinePrompt({
	total,
	onGo,
	onClose,
}: {
	/** Lines in the active file, shown as a hint and used as the upper bound. */
	total: number;
	onGo: (line: number) => void;
	onClose: () => void;
}) {
	const [value, setValue] = useState("");
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const submit = () => {
		const line = parseLine(value, total);
		if (line !== null) onGo(line);
		onClose();
	};

	return (
		<div className="goto" role="dialog" aria-label="Go to line">
			<div className="goto-head">
				<span className="label">go to line</span>
				<input
					ref={inputRef}
					className="goto-input"
					inputMode="numeric"
					aria-label="Line number"
					value={value}
					onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, ""))}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							submit();
							return;
						}
						if (event.key === "Escape") {
							event.preventDefault();
							onClose();
						}
					}}
				/>
				<span className="goto-detail">{`1–${Math.max(total, 1)}`}</span>
			</div>
			<p className="goto-empty">Type a line number, then Enter.</p>
		</div>
	);
}
