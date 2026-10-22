import { open } from "@tauri-apps/plugin-dialog";
import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";
import FileTree from "@/components/FileTree";
import StatusBar from "@/components/StatusBar";
import TabStrip from "@/components/TabStrip";
import Welcome from "@/components/Welcome";
import Editor from "@/editor/Editor";
import {
	combineDiagnostics,
	countSeverities,
	type DiagnosticMap,
	groupDiagnostics,
	withServerDiagnostics,
} from "@/lsp/diagnostics";
import { useDiagnosticsFeed } from "@/lsp/feed";
import { useDocumentSync, useLspServer } from "@/lsp/session";
import { fileName, plural, problemFiles } from "@/problems/model";
import ProblemsPanel from "@/problems/ProblemsPanel";
import {
	buildProject,
	type Diagnostic,
	type FileEntry,
	openProject,
	type ProjectInfo,
	readTextFile,
	type ToolchainReport,
	toolchains,
	version,
} from "@/project/api";
import type { FileBuffer } from "@/project/buffer";
import { describeError } from "@/project/errors";
import SearchPalette from "@/search/SearchPalette";
import "./styles.css";

/**
 * The editor gains an optional `diagnostics` member in its own unit, so the app passes it through a
 * widened view: the prop is wired now and the editor renders it whenever it lands.
 */
type EditorSurface = ComponentType<{
	path: string | null;
	value: string;
	onChange: (value: string) => void;
	diagnostics?: Diagnostic[];
}>;

const EditorWithDiagnostics = Editor as unknown as EditorSurface;

export default function App() {
	const [appVersion, setAppVersion] = useState("");
	const [project, setProject] = useState<ProjectInfo | null>(null);
	const [report, setReport] = useState<ToolchainReport | null>(null);
	const [reportFailed, setReportFailed] = useState(false);
	const [buffers, setBuffers] = useState<FileBuffer[]>([]);
	const [activePath, setActivePath] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [opening, setOpening] = useState(false);
	const [serverDiagnostics, setServerDiagnostics] = useState<DiagnosticMap>(() => new Map());
	const [buildDiagnostics, setBuildDiagnostics] = useState<DiagnosticMap>(() => new Map());
	const [buildSummary, setBuildSummary] = useState<string | null>(null);
	const [building, setBuilding] = useState(false);
	/** `null` means "follow the default": open when there is an error, collapsed otherwise. */
	const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
	const [searchOpen, setSearchOpen] = useState(false);
	const reading = useRef<Set<string>>(new Set());

	useEffect(() => {
		version().then(setAppVersion, () => setAppVersion(""));
		toolchains().then(
			(next) => {
				setReport(next);
				setReportFailed(false);
			},
			() => {
				setReport(null);
				setReportFailed(true);
			},
		);
	}, []);

	const root = project?.root ?? null;
	const active = buffers.find((buffer) => buffer.path === activePath) ?? null;

	const reportNotice = useCallback((message: string) => setNotice(message), []);
	const lsp = useLspServer(root, reportNotice);

	const handlePublish = useCallback((path: string, diagnostics: Diagnostic[]) => {
		setServerDiagnostics((current) => withServerDiagnostics(current, path, diagnostics));
	}, []);
	useDiagnosticsFeed({ root, onPublish: handlePublish, onError: reportNotice });

	useDocumentSync({
		root,
		path: active?.path ?? null,
		text: active?.text ?? "",
		report: reportNotice,
	});

	const diagnostics = useMemo(
		() => combineDiagnostics(serverDiagnostics, buildDiagnostics),
		[serverDiagnostics, buildDiagnostics],
	);
	const counts = useMemo(() => countSeverities(diagnostics), [diagnostics]);
	const files = useMemo(() => problemFiles(diagnostics), [diagnostics]);
	const panelExpanded = panelOpen ?? counts.errors > 0;

	const previousErrors = useRef(counts.errors);
	useEffect(() => {
		if (counts.errors > 0 && previousErrors.current === 0) {
			setPanelOpen(null);
		}
		previousErrors.current = counts.errors;
	}, [counts.errors]);

	const handleOpenProject = useCallback(async () => {
		setOpening(true);
		setNotice(null);
		try {
			const picked = await open({
				directory: true,
				multiple: false,
				title: "Open project",
			});
			const nextRoot = typeof picked === "string" ? picked : null;
			if (!nextRoot) {
				return;
			}
			const next = await openProject(nextRoot);
			setProject(next);
			setBuffers([]);
			setActivePath(null);
			setServerDiagnostics(new Map());
			setBuildDiagnostics(new Map());
			setBuildSummary(null);
			setPanelOpen(null);
			setSearchOpen(false);
		} catch (error) {
			setNotice(describeError(error));
		} finally {
			setOpening(false);
		}
	}, []);

	/** `Cmd+F` opens the palette everywhere except inside the editor, which keeps its own keys. */
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
				return;
			}
			if (event.key.toLowerCase() !== "f" || root === null) {
				return;
			}
			const focused = document.activeElement;
			if (focused instanceof Element && focused.closest(".cm-editor") !== null) {
				return;
			}
			event.preventDefault();
			setSearchOpen(true);
		};
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [root]);

	const openPath = useCallback(
		async (path: string, name: string) => {
			if (buffers.some((buffer) => buffer.path === path)) {
				setActivePath(path);
				return;
			}
			if (reading.current.has(path)) {
				return;
			}
			reading.current.add(path);
			try {
				const text = await readTextFile(path);
				setBuffers((current) =>
					current.some((buffer) => buffer.path === path)
						? current
						: [...current, { path, name, text, loaded: text }],
				);
				setActivePath(path);
				setNotice(null);
			} catch (error) {
				setNotice(`Could not open ${name}: ${describeError(error)}`);
			} finally {
				reading.current.delete(path);
			}
		},
		[buffers],
	);

	const handleOpenFile = useCallback(
		(entry: FileEntry) => {
			void openPath(entry.path, entry.name);
		},
		[openPath],
	);

	const handleSelectProblem = useCallback(
		(path: string) => {
			void openPath(path, fileName(path));
		},
		[openPath],
	);

	/** A search row reuses the file-tree flow; the already-active tab needs no second open. */
	const handleOpenMatch = useCallback(
		(path: string) => {
			setSearchOpen(false);
			if (path === activePath) {
				return;
			}
			void openPath(path, fileName(path));
		},
		[activePath, openPath],
	);

	const closeSearch = useCallback(() => setSearchOpen(false), []);

	const handleChange = useCallback(
		(value: string) => {
			setBuffers((current) =>
				current.map((buffer) =>
					buffer.path === activePath ? { ...buffer, text: value } : buffer,
				),
			);
		},
		[activePath],
	);

	const handleClose = useCallback(
		(path: string) => {
			const index = buffers.findIndex((buffer) => buffer.path === path);
			if (index === -1) {
				return;
			}
			const remaining = buffers.filter((buffer) => buffer.path !== path);
			setBuffers(remaining);
			if (activePath === path) {
				const neighbour = remaining[index] ?? remaining[index - 1] ?? null;
				setActivePath(neighbour ? neighbour.path : null);
			}
		},
		[buffers, activePath],
	);

	const handleBuild = useCallback(async () => {
		if (root === null || building) {
			return;
		}
		setBuilding(true);
		try {
			const result = await buildProject(root, "debug");
			setBuildDiagnostics(groupDiagnostics(result.diagnostics));
			setBuildSummary(result.summary);
		} catch (error) {
			setNotice(`Build failed: ${describeError(error)}`);
		} finally {
			setBuilding(false);
		}
	}, [root, building]);

	const serverLabel =
		lsp === null
			? root === null
				? "no project"
				: "starting"
			: lsp.version === null
				? lsp.server
				: `${lsp.server} ${lsp.version}`;

	return (
		<div className="shell">
			<header className="titlebar" data-tauri-drag-region="">
				<span className="wordmark">quarry</span>
				<button
					type="button"
					className="button"
					disabled={opening}
					onClick={handleOpenProject}
				>
					{opening ? "Opening" : "Open project"}
				</button>
				<button
					type="button"
					className="button"
					disabled={root === null || building}
					onClick={handleBuild}
				>
					{building ? "Building…" : "Build"}
				</button>
				<span className="crumbs" title={project ? project.root : undefined}>
					{project ? project.root : "no project open"}
				</span>
			</header>

			{notice ? (
				<div className="notice" role="status">
					<span className="notice-text" title={notice}>
						{notice}
					</span>
					<button type="button" className="notice-close" onClick={() => setNotice(null)}>
						dismiss
					</button>
				</div>
			) : null}

			<div className="body">
				<aside className="rail">
					<div className="rail-head">
						<span className="label">explorer</span>
					</div>
					{project ? (
						<FileTree
							key={project.root}
							root={project.root}
							activePath={activePath}
							onOpenFile={handleOpenFile}
						/>
					) : (
						<p className="empty">No folder open. Use Open project to choose one.</p>
					)}
				</aside>

				<main className="canvas">
					{active ? (
						<>
							<TabStrip
								buffers={buffers}
								activePath={activePath}
								onActivate={setActivePath}
								onClose={handleClose}
							/>
							<div className="editor-pane">
								<EditorWithDiagnostics
									path={active.path}
									value={active.text}
									onChange={handleChange}
									diagnostics={diagnostics.get(active.path)}
								/>
							</div>
						</>
					) : (
						<Welcome project={project} />
					)}
					{project ? (
						<ProblemsPanel
							files={files}
							errors={counts.errors}
							warnings={counts.warnings}
							open={panelExpanded}
							onToggle={() => setPanelOpen(!panelExpanded)}
							onSelect={handleSelectProblem}
							activePath={activePath}
						/>
					) : null}
					{searchOpen && root !== null ? (
						<SearchPalette root={root} onOpen={handleOpenMatch} onClose={closeSearch} />
					) : null}
				</main>
			</div>

			<StatusBar
				version={appVersion}
				project={project}
				report={report}
				reportFailed={reportFailed}
				extra={
					<>
						<span className="label">lsp</span>
						<span className="status-server" title={lsp?.root}>
							{serverLabel}
						</span>
						<span className="sep">·</span>
						<span className={counts.errors > 0 ? "count error" : "count"}>
							{plural(counts.errors, "error")}
						</span>
						<span className="sep">·</span>
						<span className={counts.warnings > 0 ? "count warning" : "count"}>
							{plural(counts.warnings, "warning")}
						</span>
						{buildSummary === null ? null : (
							<>
								<span className="sep">·</span>
								<span className="status-build" title={buildSummary}>
									{buildSummary}
								</span>
							</>
						)}
					</>
				}
			/>
		</div>
	);
}
