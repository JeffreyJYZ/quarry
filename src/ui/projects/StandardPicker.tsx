import type { JSX } from "react";
import { type Kind, STANDARDS } from "./kinds";

/** The language-standard buttons the selected kind offers. */
export function StandardPicker(props: {
	kind: Kind;
	standard: string;
	onSelect: (next: string) => void;
}): JSX.Element {
	const { kind, standard, onSelect } = props;
	return (
		<div className="newproject-row">
			<span className="label">Language standard</span>
			{/* biome-ignore lint/a11y/useSemanticElements: a fieldset would restyle the row; the group role carries the label */}
			<div className="newproject-standards" role="group" aria-label="Language standard">
				{STANDARDS[kind].map((option) => (
					<button
						key={option.value}
						type="button"
						className={
							standard === option.value
								? "newproject-standard active"
								: "newproject-standard"
						}
						aria-pressed={standard === option.value}
						onClick={() => onSelect(option.value)}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	);
}
