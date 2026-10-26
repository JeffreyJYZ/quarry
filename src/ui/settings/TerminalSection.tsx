import type { JSX } from "react";
import { useEffect, useState } from "react";
import { FONT_SIZE_RANGE, type Preferences, type TerminalPlacement } from "@/lib/settings/model";
import {
	TERMINAL_CURSOR_STYLES,
	type TerminalCursorStyle,
	clampLetterSpacing,
	clampLineHeight,
	clampScrollback,
} from "@/lib/settings/terminal";

import { Stepper } from "./controls";

/** A number field that validates on change through the model's clamp helper. */
function NumberField(props: {
	id: string;
	value: number;
	min: number;
	max: number;
	step: number;
	clamp: (value: unknown, fallback: number) => number;
	onChange: (next: number) => void;
}): JSX.Element {
	const { id, value, min, max, step, clamp, onChange } = props;
	const [draft, setDraft] = useState(String(value));

	useEffect(() => {
		setDraft(String(value));
	}, [value]);

	return (
		<input
			id={id}
			type="number"
			min={min}
			max={max}
			step={step}
			className="settings-text settings-number"
			value={draft}
			onChange={(event) => {
				const raw = event.target.value;
				setDraft(raw);
				if (raw.trim() === "") return;
				const parsed = Number(raw);
				if (!Number.isFinite(parsed)) return;
				onChange(clamp(parsed, value));
			}}
			onBlur={() => setDraft(String(value))}
		/>
	);
}

/** Terminal placement, font, and emulator behaviour. */
export function TerminalSection(props: {
	user: Preferences;
	onChange: (patch: Partial<Preferences>) => void;
}): JSX.Element {
	const { user, onChange } = props;
	return (
		<section className="settings-section">
			<h3 className="settings-heading">Terminal</h3>
			<div className="settings-row">
				<span>Placement</span>
				<select
					className="settings-select"
					value={user.terminalPlacement}
					onChange={(event) =>
						onChange({ terminalPlacement: event.target.value as TerminalPlacement })
					}
				>
					<option value="bottom">bottom</option>
					<option value="right">right</option>
				</select>
			</div>
			<div className="settings-row">
				<label htmlFor="settings-terminal-font">Font size</label>
				<Stepper
					id="settings-terminal-font"
					label="terminal font size"
					value={user.terminalFontSize}
					min={FONT_SIZE_RANGE.min}
					max={FONT_SIZE_RANGE.max}
					onChange={(next) => onChange({ terminalFontSize: next })}
				/>
			</div>
			<div className="settings-row">
				<label htmlFor="settings-terminal-family">Font family</label>
				<input
					id="settings-terminal-family"
					type="text"
					className="settings-text"
					value={user.terminalFontFamily}
					placeholder="empty: built-in monospace"
					spellCheck={false}
					onChange={(event) => onChange({ terminalFontFamily: event.target.value })}
				/>
			</div>
			<div className="settings-row settings-row-compact">
				<span>Style</span>
				<div className="settings-actions">
					<select
						className="settings-select"
						value={user.terminalCursorStyle}
						onChange={(event) =>
							onChange({
								terminalCursorStyle: event.target.value as TerminalCursorStyle,
							})
						}
						aria-label="Cursor style"
					>
						{TERMINAL_CURSOR_STYLES.map((style) => (
							<option key={style} value={style}>
								{style}
							</option>
						))}
					</select>
					<select
						className="settings-select"
						value={user.terminalCursorBlink ? "on" : "off"}
						onChange={(event) =>
							onChange({ terminalCursorBlink: event.target.value === "on" })
						}
						aria-label="Cursor blink"
					>
						<option value="on">blink on</option>
						<option value="off">blink off</option>
					</select>
				</div>
			</div>
			<div className="settings-row">
				<label htmlFor="settings-terminal-line-height">Line height</label>
				<NumberField
					id="settings-terminal-line-height"
					value={user.terminalLineHeight}
					min={1}
					max={2}
					step={0.1}
					clamp={clampLineHeight}
					onChange={(next) => onChange({ terminalLineHeight: next })}
				/>
			</div>
			<div className="settings-row">
				<label htmlFor="settings-terminal-letter-spacing">Letter spacing</label>
				<NumberField
					id="settings-terminal-letter-spacing"
					value={user.terminalLetterSpacing}
					min={-2}
					max={4}
					step={1}
					clamp={clampLetterSpacing}
					onChange={(next) => onChange({ terminalLetterSpacing: next })}
				/>
			</div>
			<div className="settings-row">
				<label htmlFor="settings-terminal-scrollback">Scrollback (lines)</label>
				<NumberField
					id="settings-terminal-scrollback"
					value={user.terminalScrollback}
					min={500}
					max={50000}
					step={500}
					clamp={clampScrollback}
					onChange={(next) => onChange({ terminalScrollback: next })}
				/>
			</div>
			<p className="settings-hint" style={{ color: "var(--muted)" }}>
				Line height 1.0–2.0, letter spacing -2 to 4 px, scrollback 500–50 000 lines. Values
				clamp on input.
			</p>
		</section>
	);
}
