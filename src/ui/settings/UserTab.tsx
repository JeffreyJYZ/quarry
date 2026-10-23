import type { JSX } from "react";
import {
	FONT_SIZE_RANGE,
	type Preferences,
	TAB_SIZES,
	type TabSize,
	type TerminalPlacement,
} from "@/lib/settings/model";
import type { State } from "@/lib/updates/store";
import { Segmented, Stepper } from "./controls";
import { LanguageServerSection } from "./LanguageServerSection";
import { ShellSections } from "./ShellSections";

/** The user-wide preferences tab: values every project starts from. */
export function UserTab(props: {
	user: Preferences;
	onChange: (patch: Partial<Preferences>) => void;
	onResetPanels: () => void;
	updates: State;
	version: string;
}): JSX.Element {
	const { user, onChange, onResetPanels, updates, version } = props;
	return (
		<>
			<section className="settings-section">
				<h3 className="settings-heading">Editor</h3>
				<div className="settings-row">
					<label htmlFor="settings-editor-font">Font size</label>
					<Stepper
						id="settings-editor-font"
						label="editor font size"
						value={user.editorFontSize}
						min={FONT_SIZE_RANGE.min}
						max={FONT_SIZE_RANGE.max}
						onChange={(next) => onChange({ editorFontSize: next })}
					/>
				</div>
				<div className="settings-row">
					<label htmlFor="settings-editor-family">Font family</label>
					<input
						id="settings-editor-family"
						type="text"
						className="settings-text"
						value={user.editorFontFamily}
						placeholder="empty: built-in monospace"
						spellCheck={false}
						onChange={(event) => onChange({ editorFontFamily: event.target.value })}
					/>
				</div>
				<div className="settings-row">
					<span>Tab size</span>
					<Segmented<TabSize>
						label="Tab size"
						value={user.editorTabSize}
						options={TAB_SIZES.map((size) => ({
							value: size,
							label: String(size),
						}))}
						onChange={(next) => {
							if (next !== null) onChange({ editorTabSize: next });
						}}
					/>
				</div>
				<div className="settings-row">
					<label htmlFor="settings-format-save">Format on save</label>
					<input
						id="settings-format-save"
						type="checkbox"
						checked={user.formatOnSave}
						onChange={(event) => onChange({ formatOnSave: event.target.checked })}
					/>
				</div>
			</section>

			<section className="settings-section">
				<h3 className="settings-heading">Terminal</h3>
				<div className="settings-row">
					<span>Placement</span>
					<Segmented<TerminalPlacement>
						label="Terminal placement"
						value={user.terminalPlacement}
						options={[
							{ value: "bottom", label: "bottom" },
							{ value: "right", label: "right" },
						]}
						onChange={(next) => {
							if (next !== null) onChange({ terminalPlacement: next });
						}}
					/>
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
			</section>

			<LanguageServerSection user={user} onChange={onChange} />
			<ShellSections
				user={user}
				onChange={onChange}
				onResetPanels={onResetPanels}
				updates={updates}
				version={version}
			/>
		</>
	);
}
