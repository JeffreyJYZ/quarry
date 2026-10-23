import type { JSX } from "react";
import type { Preferences } from "@/lib/settings/model";

/** The user-wide language-server paths and arguments, discovered from PATH when empty. */
export function LanguageServerSection(props: {
	user: Preferences;
	onChange: (patch: Partial<Preferences>) => void;
}): JSX.Element {
	const { user, onChange } = props;
	return (
		<section className="settings-section">
			<h3 className="settings-heading">Language servers</h3>
			<div className="settings-row">
				<label htmlFor="settings-ra-path">rust-analyzer path</label>
				<input
					id="settings-ra-path"
					type="text"
					className="settings-text"
					value={user.rustAnalyzerPath}
					placeholder="empty: found on PATH"
					spellCheck={false}
					onChange={(event) => onChange({ rustAnalyzerPath: event.target.value })}
				/>
			</div>
			<div className="settings-row">
				<label htmlFor="settings-ra-args">rust-analyzer args</label>
				<input
					id="settings-ra-args"
					type="text"
					className="settings-text"
					value={user.rustAnalyzerArgs}
					placeholder="empty: none"
					spellCheck={false}
					onChange={(event) => onChange({ rustAnalyzerArgs: event.target.value })}
				/>
			</div>
			<div className="settings-row">
				<label htmlFor="settings-clangd-path">clangd path</label>
				<input
					id="settings-clangd-path"
					type="text"
					className="settings-text"
					value={user.clangdPath}
					placeholder="empty: found on PATH"
					spellCheck={false}
					onChange={(event) => onChange({ clangdPath: event.target.value })}
				/>
			</div>
			<div className="settings-row">
				<label htmlFor="settings-clangd-args">clangd args</label>
				<input
					id="settings-clangd-args"
					type="text"
					className="settings-text"
					value={user.clangdArgs}
					placeholder="empty: none"
					spellCheck={false}
					onChange={(event) => onChange({ clangdArgs: event.target.value })}
				/>
			</div>
			<p className="settings-hint">Restart a server by closing and reopening the project.</p>
		</section>
	);
}
