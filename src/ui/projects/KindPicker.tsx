import type { JSX } from "react";
import { KINDS, type Kind } from "./kinds";

/** The radio list of scaffold kinds; picking one also resets the language standard. */
export function KindPicker(props: { kind: Kind; onSelect: (next: Kind) => void }): JSX.Element {
	const { kind, onSelect } = props;
	return (
		<fieldset className="newproject-kinds">
			<legend className="label">Kind</legend>
			{KINDS.map((option) => (
				<label key={option.value} className="newproject-kind">
					<input
						type="radio"
						name="newproject-kind"
						value={option.value}
						checked={kind === option.value}
						onChange={() => onSelect(option.value)}
					/>
					<span className="newproject-kind-label">{option.label}</span>
					<span className="newproject-kind-hint">{option.hint}</span>
				</label>
			))}
		</fieldset>
	);
}
