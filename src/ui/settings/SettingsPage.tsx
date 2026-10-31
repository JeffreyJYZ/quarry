import { type JSX, useEffect, useRef, useState } from "react";
import {
	effectivePreferences,
	normalizePreferences,
	normalizeProjectSettings,
	projectSettingsAreEmpty,
	type Preferences,
	type ProjectSettings,
} from "@/lib/settings/model";
import "@/ui/settings/settings.css";
import { ProjectTab } from "./ProjectTab";
import { UserTab } from "./UserTab";
import { useSettingsSearch } from "./settingsSearch";

export type SettingsPageProps = {
	open: boolean;
	user: Preferences;
	/** null when no project is open, or when the project file does not exist yet. */
	project: ProjectSettings | null;
	projectRoot: string | null;
	onClose: () => void;
	onUserChange: (next: Preferences) => void;
	/** null removes the project's overrides; the caller deletes the file. */
	onProjectChange: (next: ProjectSettings | null) => void;
	/** Resets every panel size to the default. */
	onResetPanels: () => void;
	/** Tab to show when the page opens; Cmd ; asks for the project tab. */
	initialTab?: Tab;
};

type Tab = "user" | "project";

/**
 * The settings page: a user-wide tab and a per-project tab that can only narrow the user's values.
 *
 * Every edit goes straight back through `onUserChange`/`onProjectChange`; there is no local draft and
 * no save button, so what the page shows is always what the shell is already using.
 */
export default function SettingsPage({
	open,
	user,
	project,
	projectRoot,
	onClose,
	onUserChange,
	onProjectChange,
	onResetPanels,
	initialTab = "user",
}: SettingsPageProps): JSX.Element | null {
	const [tab, setTab] = useState<Tab>(initialTab);
	// updates/version now live in UpdatesSection
	const panelRef = useRef<HTMLDivElement>(null);
	const openerRef = useRef<HTMLElement | null>(null);
	const { query, setQuery, bodyRef, matches } = useSettingsSearch(open, tab);
	const effective = effectivePreferences(user, project);
	const projectEmpty = project === null || projectSettingsAreEmpty(project);

	useEffect(() => {
		if (!open) return;
		openerRef.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		setTab(initialTab);
		panelRef.current?.focus();
		return () => {
			openerRef.current?.focus();
		};
	}, [initialTab, open]);

	if (!open) return null;

	const setUser = (patch: Partial<Preferences>) => {
		onUserChange(normalizePreferences({ ...user, ...patch }));
	};
	const setProject = (patch: Partial<ProjectSettings>) => {
		onProjectChange(normalizeProjectSettings({ ...(project ?? {}), ...patch }));
	};

	return (
		<div
			className="settings-backdrop"
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				className="settings-panel"
				role="dialog"
				aria-modal="true"
				aria-labelledby="settings-title"
				tabIndex={-1}
				ref={panelRef}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						onClose();
						return;
					}
					if (event.key !== "Tab") return;
					const panel = panelRef.current;
					if (panel === null) return;
					const focusable = panel.querySelectorAll<HTMLElement>(
						'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
					);
					if (focusable.length === 0) {
						event.preventDefault();
						return;
					}
					const first = focusable[0];
					const last = focusable[focusable.length - 1];
					if (event.shiftKey && document.activeElement === first) {
						event.preventDefault();
						last.focus();
					} else if (!event.shiftKey && document.activeElement === last) {
						event.preventDefault();
						first.focus();
					}
				}}
			>
				<header className="settings-head">
					<span className="label" id="settings-title">
						settings
					</span>
					<input
						className="settings-search"
						type="search"
						placeholder="Search settings"
						aria-label="Search settings"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
					<button type="button" className="settings-close" onClick={onClose}>
						close
					</button>
				</header>

				<div className="settings-tabs" role="tablist" aria-label="Settings scope">
					<button
						type="button"
						role="tab"
						aria-selected={tab === "user"}
						className={tab === "user" ? "settings-tab active" : "settings-tab"}
						onClick={() => setTab("user")}
					>
						User
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={tab === "project"}
						disabled={projectRoot === null}
						title={projectRoot === null ? "Open a project first" : projectRoot}
						className={tab === "project" ? "settings-tab active" : "settings-tab"}
						onClick={() => setTab("project")}
					>
						This project
					</button>
				</div>

				<div className="settings-body" ref={bodyRef}>
					{tab === "user" ? (
						<UserTab user={user} onChange={setUser} onResetPanels={onResetPanels} />
					) : (
						<ProjectTab
							project={project}
							projectRoot={projectRoot}
							effective={effective}
							projectEmpty={projectEmpty}
							onChange={setProject}
							onClear={() => onProjectChange(null)}
						/>
					)}
					{query.trim() !== "" && matches === 0 ? (
						<p className="settings-empty">No setting matches this search</p>
					) : null}
				</div>

				<footer className="settings-foot">
					<span className="settings-hint">
						{tab === "user"
							? "Applies to every project"
							: "Applies to this project only"}
					</span>
					<span className="settings-mono">cmd/ctrl + ,</span>
				</footer>
			</div>
		</div>
	);
}
