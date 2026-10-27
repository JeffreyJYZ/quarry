import { type JSX, useState } from "react";
import type { Preferences } from "@/lib/settings/model";
import { BUILTIN_THEMES } from "@/lib/themes/builtin";
import { DEFAULT_THEME_ID } from "@/lib/themes/model";
import { parseThemeJson } from "@/lib/themes/parse";

/**
 * Theme selection: the picker, the paste box and the delete action for imported themes.
 *
 * Every edit goes through `onChange` as a preference patch, so the shell persists it and `useTheme`
 * repaints on the same render — there is no draft of the active theme here.
 */
export function AppearanceSection(props: {
	user: Preferences;
	onChange: (patch: Partial<Preferences>) => void;
}): JSX.Element {
	const { user, onChange } = props;
	const [draft, setDraft] = useState("");
	const [error, setError] = useState<string | null>(null);
	const imported = user.customThemes;
	const active = [...BUILTIN_THEMES, ...imported].find((theme) => theme.id === user.theme);

	const handleImport = () => {
		const result = parseThemeJson(draft);
		if (!result.ok) {
			setError(result.error);
			return;
		}
		const merged = [...imported];
		for (const theme of result.themes) {
			const at = merged.findIndex((entry) => entry.id === theme.id);
			if (at === -1) merged.push(theme);
			else merged[at] = theme;
		}
		setError(null);
		setDraft("");
		onChange({ customThemes: merged, theme: result.themes[0].id });
	};

	const handleDelete = (id: string) => {
		onChange({
			customThemes: imported.filter((theme) => theme.id !== id),
			theme: user.theme === id ? DEFAULT_THEME_ID : user.theme,
		});
	};

	return (
		<section className="settings-section">
			<h3 className="settings-heading">Appearance</h3>
			<div className="settings-row">
				<label htmlFor="settings-theme">Theme</label>
				<select
					id="settings-theme"
					className="settings-select"
					value={active?.id ?? DEFAULT_THEME_ID}
					onChange={(event) => onChange({ theme: event.target.value })}
				>
					<optgroup label="Built-in">
						{BUILTIN_THEMES.map((theme) => (
							<option key={theme.id} value={theme.id}>
								{theme.name}
							</option>
						))}
					</optgroup>
					{imported.length > 0 ? (
						<optgroup label="Imported">
							{imported.map((theme) => (
								<option key={theme.id} value={theme.id}>
									{theme.name}
								</option>
							))}
						</optgroup>
					) : null}
				</select>
			</div>

			{imported.length > 0 ? (
				<div className="settings-theme-list">
					{imported.map((theme) => (
						<div className="settings-theme-item" key={theme.id}>
							<span className="settings-mono">{theme.name}</span>
							<button
								type="button"
								className="settings-theme-delete"
								onClick={() => handleDelete(theme.id)}
							>
								Delete
							</button>
						</div>
					))}
				</div>
			) : null}

			<label className="settings-hint" htmlFor="settings-theme-json">
				Paste theme JSON…
			</label>
			<textarea
				id="settings-theme-json"
				className="settings-textarea"
				rows={5}
				spellCheck={false}
				value={draft}
				placeholder={'{ "name": "My Theme", "tokens": { "bg": "#1b1e24" } }'}
				onChange={(event) => setDraft(event.target.value)}
			/>
			<div className="settings-actions">
				<button
					type="button"
					className="settings-button"
					disabled={draft.trim() === ""}
					onClick={handleImport}
				>
					Import
				</button>
			</div>
			{error !== null ? (
				<p className="settings-error" role="alert">
					{error}
				</p>
			) : null}
		</section>
	);
}
