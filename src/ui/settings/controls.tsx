import type { JSX } from "react";
import { clampFontSize } from "@/lib/settings/model";

/** A number field with −/+ buttons, clamped to the given range. */
export function Stepper(props: {
	id: string;
	label: string;
	value: number;
	min: number;
	max: number;
	onChange: (next: number) => void;
}): JSX.Element {
	const { id, label, value, min, max, onChange } = props;
	return (
		<div className="settings-stepper">
			<button
				type="button"
				className="settings-step"
				aria-label={`Decrease ${label}`}
				disabled={value <= min}
				onClick={() => onChange(clampFontSize(value - 1, min))}
			>
				−
			</button>
			<input
				id={id}
				type="number"
				min={min}
				max={max}
				value={value}
				onChange={(event) => onChange(clampFontSize(Number(event.target.value), value))}
			/>
			<button
				type="button"
				className="settings-step"
				aria-label={`Increase ${label}`}
				disabled={value >= max}
				onClick={() => onChange(clampFontSize(value + 1, max))}
			>
				+
			</button>
		</div>
	);
}

/** A row of exclusive options, optionally with an "Inherit" choice that yields `null`. */
export function Segmented<T extends string | number>(props: {
	label: string;
	value: T | null;
	options: { value: T; label: string }[];
	allowInherit?: boolean;
	onChange: (next: T | null) => void;
}): JSX.Element {
	const { label, value, options, allowInherit = false, onChange } = props;
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset would restyle the row; the group role carries the label
		<div className="settings-segmented" role="group" aria-label={label}>
			{allowInherit ? (
				<button
					type="button"
					className={value === null ? "settings-seg active" : "settings-seg"}
					aria-pressed={value === null}
					onClick={() => onChange(null)}
				>
					Inherit
				</button>
			) : null}
			{options.map((option) => (
				<button
					key={String(option.value)}
					type="button"
					className={value === option.value ? "settings-seg active" : "settings-seg"}
					aria-pressed={value === option.value}
					onClick={() => onChange(option.value)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}
