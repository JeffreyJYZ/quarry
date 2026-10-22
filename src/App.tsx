import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import FileTree from "@/components/FileTree";
import StatusBar from "@/components/StatusBar";
import TabStrip from "@/components/TabStrip";
import Welcome from "@/components/Welcome";
import Editor from "@/editor/Editor";
import {
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
import "./styles.css";

export default function App() {
	const [appVersion, setAppVersion] = useState("");
	const [project, setProject] = useState<ProjectInfo | null>(null);
	const [report, setReport] = useState<ToolchainReport | null>(null);
	const [reportFailed, setReportFailed] = useState(false);
	const [buffers, setBuffers] = useState<FileBuffer[]>([]);
	const [activePath, setActivePath] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [opening, setOpening] = useState(false);
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

	const active = buffers.find((buffer) => buffer.path === activePath) ?? null;

	const handleOpenProject = useCallback(async () => {
		setOpening(true);
		setNotice(null);
		try {
			const picked = await open({
				directory: true,
				multiple: false,
				title: "Open project",
			});
			const root = typeof picked === "string" ? picked : null;
			if (!root) {
				return;
			}
			const next = await openProject(root);
			setProject(next);
			setBuffers([]);
			setActivePath(null);
		} catch (error) {
			setNotice(describeError(error));
		} finally {
			setOpening(false);
		}
	}, []);

	const handleOpenFile = useCallback(
		async (entry: FileEntry) => {
			if (buffers.some((buffer) => buffer.path === entry.path)) {
				setActivePath(entry.path);
				return;
			}
			if (reading.current.has(entry.path)) {
				return;
			}
			reading.current.add(entry.path);
			try {
				const text = await readTextFile(entry.path);
				setBuffers((current) =>
					current.some((buffer) => buffer.path === entry.path)
						? current
						: [...current, { path: entry.path, name: entry.name, text, loaded: text }],
				);
				setActivePath(entry.path);
				setNotice(null);
			} catch (error) {
				setNotice(`Could not open ${entry.name}: ${describeError(error)}`);
			} finally {
				reading.current.delete(entry.path);
			}
		},
		[buffers],
	);

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
								<Editor
									path={active.path}
									value={active.text}
									onChange={handleChange}
								/>
							</div>
						</>
					) : (
						<Welcome project={project} />
					)}
				</main>
			</div>

			<StatusBar
				version={appVersion}
				project={project}
				report={report}
				reportFailed={reportFailed}
			/>
		</div>
	);
}
