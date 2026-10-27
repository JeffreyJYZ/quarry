import type { JSX } from "react";
import { FONT_SIZE_RANGE, type Preferences, TAB_SIZES, type TabSize } from "@/lib/settings/model";

import { AppearanceSection } from "./AppearanceSection";
import { Segmented, Stepper } from "./controls";
import { LanguageServerSection } from "./LanguageServerSection";
import { ShellSections } from "./ShellSections";
import { TerminalSection } from "./TerminalSection";
import { UpdatesSection } from "./UpdatesSection";

/** The user-wide preferences tab: values every project starts from. */
export function UserTab(props: {
	user: Preferences;
	onChange: (patch: Partial<Preferences>) => void;
	onResetPanels: () => void;
}): JSX.Element {
	const { user, onChange, onResetPanels } = props;
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

			<AppearanceSection user={user} onChange={onChange} />

			<TerminalSection user={user} onChange={onChange} />

			<LanguageServerSection user={user} onChange={onChange} />
			<UpdatesSection />
			<ShellSections user={user} onChange={onChange} onResetPanels={onResetPanels} />
		</>
	);
}
