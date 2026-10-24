import type { JSX } from "react";
import { type Kind, STANDARDS } from "./kinds";

/** The language standard the selected kind offers: a Rust edition or a C/C++ standard. */
export function StandardPicker(props: {
	kind: Kind;
	standard: string;
	onSelect: (next: string) => void;
}): JSX.Element {
	const { kind, standard, onSelect } = props;
	return (
		<div className="newproject-row">
			<label htmlFor="newproject-standard">Language standard</label>
			<select
				id="newproject-standard"
				value={standard}
				onChange={(event) => onSelect(event.target.value)}
			>
				{STANDARDS[kind].map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</div>
	);
}
