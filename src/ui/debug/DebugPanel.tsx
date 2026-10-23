import { useCallback, useEffect, useRef, useState } from "react";
import BreakpointItem from "@/ui/debug/BreakpointItem";
import DisasmPane from "@/ui/debug/memory/DisasmPane";
import MemoryPane from "@/ui/debug/memory/MemoryPane";
import ProcessPicker from "@/ui/debug/ProcessPicker";
import {
	type DraftPreset,
	toDraftPreset,
	toLaunchPreset,
	validateLaunchFile,
} from "@/lib/debug/presets";
import type { DebugController, VariableRow } from "@/lib/debug/session";
import { pinKey } from "@/lib/debug/watch";
import { fileName } from "@/lib/problems/model";
import type { DapVariable } from "@/lib/project/api";
import { readLaunchConfig, writeLaunchConfig } from "@/lib/project/api";

/** How many characters of a program path the panel keeps when it truncates from the left. */
const PROGRAM_CHARS = 36;

/** The `initCommands` line that makes Rust `Vec`/`String` pretty-print; without it they arrive raw. */
const RUST_PRETTY_HINT =
	"Rust pretty printing needs: command script import <sysroot>/lib/rustlib/etc/lldb_lookup.py";

/** The path tail is what identifies the binary, so the head is what goes when space runs out. */
function truncateLeft(path: string): string {
	if (path.length <= PROGRAM_CHARS) {
		return path;
	}
	return `…${path.slice(path.length - (PROGRAM_CHARS - 1))}`;
}

type VariableListProps = {
	variables: DapVariable[];
	containerRef: number;
	prefix: string;
	depth: number;
	debug: DebugController;
	pathNames: string[];
	scopeRef: number;
};

/** One container's rows; recursion only happens through an expanded parent row. */
function VariableList({
	variables,
	containerRef,
	prefix,
	depth,
	debug,
	pathNames,
	scopeRef,
}: VariableListProps) {
	return (
		<>
			{variables.map((variable, index) => {
				const row: VariableRow = {
					key: `${prefix}/${index}`,
					containerRef,
					scopeReference: scopeRef,
					path: pathNames,
					depth,
					name: variable.name,
					value: variable.value,
					typeName: variable.typeName,
					variablesReference: variable.variablesReference,
					memoryReference: variable.memoryReference,
				};
				return <VariableBranch key={row.key} row={row} debug={debug} />;
			})}
		</>
	);
}

function VariableBranch({ row, debug }: { row: VariableRow; debug: DebugController }) {
	const expandable = row.variablesReference > 0;
	const editable = !expandable;
	const open = expandable && debug.expanded.has(row.key);
	const children = open ? (debug.children.get(row.variablesReference) ?? null) : null;
	const selected = debug.selectedVariable !== null && debug.selectedVariable.key === row.key;
	const watching = debug.status === "stopped";
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(row.value);
	const [inFlight, setInFlight] = useState(false);

	const submit = useCallback(async () => {
		if (inFlight) return;
		if (draft === row.value) {
			setEditing(false);
			return;
		}
		setInFlight(true);
		try {
			await debug.setVariable(row, draft);
			setEditing(false);
		} catch {
			setDraft(row.value);
			setEditing(false);
		} finally {
			setInFlight(false);
		}
	}, [debug, draft, inFlight, row]);

	const cancel = useCallback(() => {
		setDraft(row.value);
		setEditing(false);
	}, [row.value]);

	// Keep draft in sync if the row value changes externally.
	useEffect(() => {
		if (!editing) setDraft(row.value);
	}, [editing, row.value]);

	return (
		<>
			<div
				className={
					selected
						? inFlight
							? "debug-var selected dimmed"
							: "debug-var selected"
						: inFlight
							? "debug-var dimmed"
							: "debug-var"
				}
			>
				<span className="debug-var-indent" style={{ width: row.depth * 10 }} />
				<button
					type="button"
					className="debug-twisty"
					disabled={!expandable}
					aria-label={open ? "Collapse" : "Expand"}
					aria-expanded={open}
					onClick={() => debug.toggleVariable(row)}
				>
					{expandable ? (
						<span className={open ? "debug-caret open" : "debug-caret"} />
					) : null}
				</button>
				<button
					type="button"
					className="debug-var-main"
					title={row.typeName ?? undefined}
					onClick={() => debug.selectVariable(row)}
				>
					<span className="debug-var-name">{row.name}</span>
					{editing ? (
						<input
							className="debug-var-input"
							value={draft}
							disabled={inFlight}
							// biome-ignore lint/a11y/noAutofocus: inline edit needs focus
							autoFocus
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									void submit();
								} else if (event.key === "Escape") {
									event.preventDefault();
									cancel();
								}
							}}
							onBlur={() => {
								if (draft !== row.value) void submit();
								else cancel();
							}}
						/>
					) : editable ? (
						// biome-ignore lint/a11y/noStaticElementInteractions: double-click to edit
						<span
							className="debug-var-value"
							onDoubleClick={() => {
								setDraft(row.value);
								setEditing(true);
							}}
						>
							{row.value}
						</span>
					) : (
						<span className="debug-var-value">{row.value}</span>
					)}
					{row.memoryReference === null ? null : (
						<span className="debug-var-mem">{row.memoryReference}</span>
					)}
				</button>
				<button
					type="button"
					className="debug-watch"
					disabled={!watching}
					title={`Watch ${row.name}`}
					onClick={() => debug.addWatchPoint(row.containerRef, row.name)}
				>
					watch
				</button>
				<button
					type="button"
					className="debug-pin"
					disabled={!watching}
					title={`Pin ${row.name}`}
					onClick={() => debug.togglePin(row)}
				>
					{debug.isPinned(row) ? "•" : "pin"}
				</button>
			</div>
			{open && children !== null ? (
				<VariableList
					variables={children}
					containerRef={row.variablesReference}
					prefix={row.key}
					depth={row.depth + 1}
					debug={debug}
					pathNames={[...row.path, row.name]}
					scopeRef={row.scopeReference}
				/>
			) : null}
		</>
	);
}

/**
 * The right-hand debugger column: presets and launch, transport controls, stack, variables, watch
 * points, breakpoints and the memory/disassembly panes. It renders state; the hook does the work.
 */
export default function DebugPanel({
	debug,
	activePath = null,
	cursor = null,
	onNavigate,
}: {
	debug: DebugController;
	activePath?: string | null;
	cursor?: { line: number; character: number } | null;
	onNavigate?: (path: string, line: number, character: number) => void;
}) {
	const view = debug.stopView;
	const top = view === null ? null : (view.frames[0] ?? null);
	const [navigated, setNavigated] = useState<{ source: string; line: number } | null>(null);
	const framesRef = useRef(view?.frames);
	// Clear the navigation marker whenever a new stop arrives (frames array changes), so a stale
	// frame never stays marked; selecting a frame keeps its array identity and the marker survives.
	useEffect(() => {
		if (framesRef.current !== view?.frames) {
			framesRef.current = view?.frames;
			setNavigated(null);
		}
	}, [view]);
	const activeFrame =
		view === null ? null : (view.frames.find((frame) => frame.id === view.frameId) ?? top);
	const memoryAddress =
		debug.selectedVariable?.memoryReference ?? activeFrame?.instructionPointer ?? null;
	const disasmAddress = activeFrame?.instructionPointer ?? null;
	const stopped = debug.status === "stopped";
	const session = debug.sessionId;
	const canAddBreakpoint = stopped && top !== null && top.source !== null;

	const [editingPresets, setEditingPresets] = useState(false);
	const [drafts, setDrafts] = useState<DraftPreset[]>([]);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [discardConfirm, setDiscardConfirm] = useState(false);

	function openEditor() {
		setDrafts(debug.presets.map(toDraftPreset));
		setSaveError(null);
		setDiscardConfirm(false);
		setEditingPresets(true);
	}

	async function saveEditor() {
		if (debug.root === null) return;
		const file = { configurations: drafts.map(toLaunchPreset) };
		const validationError = validateLaunchFile(
			file as { configurations: Array<Record<string, unknown>> },
		);
		if (validationError !== null) {
			setSaveError(validationError);
			return;
		}
		try {
			await writeLaunchConfig(
				debug.root,
				file as { configurations: ReturnType<typeof toLaunchPreset>[] },
			);
			await readLaunchConfig(debug.root);
			await debug.refreshPresets();
			setEditingPresets(false);
			setSaveError(null);
		} catch (reason) {
			setSaveError(String(reason));
		}
	}

	return (
		<aside className="debug" aria-label="Debugger">
			<div className="debug-head">
				<span className="label">debug</span>
				<span className={`debug-status ${debug.restarting ? "dimmed" : debug.status}`}>
					{debug.restarting ? "restarting…" : debug.status}
				</span>
				{debug.sessionKind === null ? null : (
					<span className="debug-session">
						{debug.sessionKind}
						{debug.sessionBuildProfile === null
							? ""
							: ` · ${debug.sessionBuildProfile}`}
						{debug.restarted ? " (restarted)" : ""}
					</span>
				)}
			</div>

			{debug.error === null ? null : (
				<p className="debug-error" role="status">
					{debug.error}
				</p>
			)}
			{debug.profileMismatch === null ? null : (
				<p className="debug-error" role="status">
					{debug.profileMismatch}
				</p>
			)}
			{debug.buildNeeded === null ? null : (
				<div className="debug-row">
					<button
						type="button"
						className="button"
						disabled={debug.building}
						onClick={debug.buildNow}
					>
						{debug.building ? "Building…" : "Build now"}
					</button>
				</div>
			)}

			<section className="debug-section">
				<div className="debug-section-head">
					<span className="label">launch</span>
					<span className="debug-count">{debug.presetEntries.length}</span>
				</div>
				<div className="debug-row">
					<select
						className="debug-select"
						value={debug.preset}
						disabled={debug.presetEntries.length === 0 || session !== null}
						onChange={(event) => debug.setPreset(event.target.value)}
					>
						{debug.presetEntries.length === 0 ? (
							<option value="">no presets</option>
						) : (
							debug.presetEntries.map((entry) => (
								<option key={entry.value} value={entry.value}>
									{entry.label}
								</option>
							))
						)}
					</select>
					<button
						type="button"
						className="button"
						disabled={
							debug.status === "launching" ||
							session !== null ||
							debug.preset === "" ||
							debug.presetEntries.length === 0
						}
						onClick={debug.launch}
					>
						Launch
					</button>
				</div>
				<div className="debug-row">
					<button type="button" className="button" onClick={openEditor}>
						Edit presets
					</button>
				</div>
				<div className="debug-row debug-row-wrap">
					<ProcessPicker debug={debug} />
					<button
						type="button"
						className="button"
						disabled={session !== null || debug.status === "launching"}
						onClick={debug.attach}
					>
						Attach
					</button>
				</div>
				{debug.presets.length === 0 ? (
					<p className="debug-note">No presets in .quarry/launch.json</p>
				) : null}
				{debug.resolved === null ? null : (
					<p className="debug-note" title={debug.resolved.program}>
						{truncateLeft(debug.resolved.program)}
					</p>
				)}
				{debug.resolved === null || debug.resolved.initCommands.length === 0 ? null : (
					<p className="debug-note">
						{debug.resolved.initCommands.length} init command
						{debug.resolved.initCommands.length === 1 ? "" : "s"} loaded
					</p>
				)}
				{debug.configError === null ? null : (
					<p className="debug-note" title={debug.configError}>
						{debug.configError}
					</p>
				)}
			</section>

			{editingPresets ? (
				<section
					className="debug-section"
					role="region"
					tabIndex={-1}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.preventDefault();
							setDiscardConfirm(true);
						}
					}}
				>
					<div className="debug-section-head">
						<span className="label">presets editor</span>
					</div>
					{drafts.map((draft, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: reorderable rows
						<div key={`${draft.name}-${index}`}>
							<div className="debug-row debug-row-wrap">
								<input
									className="debug-input"
									value={draft.name}
									placeholder="name"
									onChange={(event) => {
										const next = [...drafts];
										next[index] = { ...draft, name: event.target.value };
										setDrafts(next);
									}}
								/>
								<input
									className="debug-input"
									value={draft.program}
									placeholder="program"
									onChange={(event) => {
										const next = [...drafts];
										next[index] = { ...draft, program: event.target.value };
										setDrafts(next);
									}}
								/>
								<input
									className="debug-input"
									value={draft.args}
									placeholder="args"
									onChange={(event) => {
										const next = [...drafts];
										next[index] = { ...draft, args: event.target.value };
										setDrafts(next);
									}}
								/>
								<input
									className="debug-input"
									value={draft.cwd}
									placeholder="cwd"
									onChange={(event) => {
										const next = [...drafts];
										next[index] = { ...draft, cwd: event.target.value };
										setDrafts(next);
									}}
								/>
								<label>
									<input
										type="checkbox"
										checked={draft.stopOnEntry}
										onChange={(event) => {
											const next = [...drafts];
											next[index] = {
												...draft,
												stopOnEntry: event.target.checked,
											};
											setDrafts(next);
										}}
									/>
									stop
								</label>
								<button
									type="button"
									className="button"
									onClick={() => {
										if (index > 0) {
											const next = [...drafts];
											[next[index - 1], next[index]] = [
												next[index],
												next[index - 1],
											];
											setDrafts(next);
										}
									}}
								>
									Up
								</button>
								<button
									type="button"
									className="button"
									onClick={() => {
										if (index < drafts.length - 1) {
											const next = [...drafts];
											[next[index], next[index + 1]] = [
												next[index + 1],
												next[index],
											];
											setDrafts(next);
										}
									}}
								>
									Down
								</button>
								<button
									type="button"
									className="button"
									onClick={() => {
										const next = drafts.filter((_, i) => i !== index);
										setDrafts(next);
									}}
								>
									Remove
								</button>
								<button
									type="button"
									className="button"
									onClick={() => {
										const next = [...drafts];
										next.splice(index + 1, 0, { ...draft });
										setDrafts(next);
									}}
								>
									Duplicate
								</button>
							</div>
							<div className="debug-row">
								<input
									className="debug-input"
									style={{ flex: "1 1 100%" }}
									value={draft.build}
									placeholder="cargo build"
									title="Build command run before launch; empty means none"
									onChange={(event) => {
										const next = [...drafts];
										next[index] = { ...draft, build: event.target.value };
										setDrafts(next);
									}}
								/>
							</div>
							<div className="debug-row">
								<textarea
									className="debug-input"
									style={{ flex: "1 1 100%", minHeight: 44 }}
									value={draft.initCommands}
									placeholder="init commands, one per line"
									title="One init command per line; empty means none"
									rows={3}
									onChange={(event) => {
										const next = [...drafts];
										next[index] = {
											...draft,
											initCommands: event.target.value,
										};
										setDrafts(next);
									}}
								/>
							</div>
							<p className="debug-note dimmed">{RUST_PRETTY_HINT}</p>
						</div>
					))}
					<div className="debug-row">
						<button
							type="button"
							className="button"
							onClick={() =>
								setDrafts([
									...drafts,
									{
										name: "",
										program: "",
										args: "",
										cwd: "",
										build: "",
										stopOnEntry: false,
										initCommands: "",
									},
								])
							}
						>
							Add preset
						</button>
						<button type="button" className="button" onClick={() => void saveEditor()}>
							Save
						</button>
						<button
							type="button"
							className="button"
							onClick={() => setDiscardConfirm(true)}
						>
							Close
						</button>
					</div>
					{saveError === null ? null : <p className="debug-error">{saveError}</p>}
					{discardConfirm ? (
						<div className="debug-row">
							<span>Discard unsaved preset edits?</span>
							<button
								type="button"
								className="button"
								onClick={() => {
									setEditingPresets(false);
									setDiscardConfirm(false);
								}}
							>
								Discard
							</button>
							<button
								type="button"
								className="button"
								onClick={() => setDiscardConfirm(false)}
							>
								Keep editing
							</button>
						</div>
					) : null}
				</section>
			) : null}
			<section className="debug-section">
				<div className="debug-section-head">
					<span className="label">controls</span>
				</div>
				<div className="debug-controls">
					<button
						type="button"
						className="button"
						disabled={!stopped}
						onClick={debug.continueRun}
					>
						Continue
					</button>
					<button
						type="button"
						className="button"
						disabled={
							debug.sessionId === null || activePath === null || cursor === null
						}
						onClick={() => {
							if (activePath !== null && cursor !== null) {
								debug.runToCursor(activePath, cursor.line + 1);
							}
						}}
					>
						Run to cursor
					</button>
					<button
						type="button"
						className="button"
						disabled={!stopped}
						onClick={() => debug.step("next")}
					>
						Next
					</button>
					<button
						type="button"
						className="button"
						disabled={!stopped}
						onClick={() => debug.step("stepIn")}
					>
						Step in
					</button>
					<button
						type="button"
						className="button"
						disabled={!stopped}
						onClick={() => debug.step("stepOut")}
					>
						Step out
					</button>
					<button
						type="button"
						className="button"
						disabled={session === null}
						onClick={debug.stop}
					>
						Stop
					</button>
					<button
						type="button"
						className="button"
						disabled={session === null || debug.restarting}
						onClick={debug.restart}
					>
						{debug.restarting ? "Restarting…" : "Restart"}
					</button>
				</div>
			</section>

			<section className="debug-section debug-frames">
				<div className="debug-section-head">
					<span className="label">frames</span>
					<span className="debug-count">{view === null ? 0 : view.frames.length}</span>
				</div>
				{view === null ? null : (
					<p className="debug-stop" title={view.description ?? undefined}>
						{view.description === null
							? view.reason
							: `${view.reason} · ${view.description}`}
					</p>
				)}
				<div className="debug-scroll">
					{view === null ? (
						<p className="debug-note">Not stopped</p>
					) : view.frames.length === 0 ? (
						<p className="debug-note">No frames</p>
					) : (
						view.frames.map((frame) => {
							const navigable = frame.source !== null && frame.line > 0;
							const marked =
								navigated !== null &&
								frame.source === navigated.source &&
								frame.line === navigated.line;
							const className = [
								"debug-frame",
								frame.id === view.frameId ? "active" : "",
								marked && frame.id !== view.frameId ? "navigated" : "",
							]
								.filter(Boolean)
								.join(" ");
							const content = (
								<>
									<span className="debug-frame-name">{frame.name}</span>
									<span className="debug-frame-pos">
										{frame.source === null
											? "—"
											: `${fileName(frame.source)}:${frame.line}`}
									</span>
								</>
							);
							if (!navigable || frame.source === null) {
								return (
									<span
										key={frame.id}
										className={className}
										title={frame.source ?? undefined}
										style={marked ? { opacity: 0.55 } : undefined}
									>
										{content}
									</span>
								);
							}
							const source = frame.source;
							return (
								<button
									key={frame.id}
									type="button"
									className={className}
									title={source}
									style={marked ? { opacity: 0.55 } : undefined}
									onClick={() => {
										debug.selectFrame(frame.id);
										setNavigated({ source, line: frame.line });
										onNavigate?.(source, frame.line - 1, 0);
									}}
								>
									{content}
								</button>
							);
						})
					)}
				</div>
			</section>

			<section className="debug-section debug-vars">
				<div className="debug-section-head">
					<span className="label">variables</span>
					<span className="debug-count">{view === null ? 0 : view.scopes.length}</span>
				</div>
				<div className="debug-scroll">
					{view === null || view.scopes.length === 0 ? (
						<p className="debug-note">No scopes</p>
					) : (
						view.scopes.map((scope) => (
							<div key={`${scope.name}:${scope.variablesReference}`}>
								<div className="debug-scope-head">{scope.name}</div>
								<VariableList
									variables={debug.children.get(scope.variablesReference) ?? []}
									containerRef={scope.variablesReference}
									prefix={`s${scope.variablesReference}`}
									depth={0}
									debug={debug}
									pathNames={[]}
									scopeRef={scope.variablesReference}
								/>
							</div>
						))
					)}
				</div>
			</section>

			<section className="debug-section debug-pins">
				<div className="debug-section-head">
					<span className="label">watch</span>
					<span className="debug-count">{debug.pins.length}</span>
				</div>
				<div className="debug-scroll">
					{debug.pins.length === 0 ? (
						<p className="debug-note">None. Stop, then press pin on a variable.</p>
					) : (
						<ul className="debug-list">
							{debug.pins.map((pin) => {
								const result = debug.pinResults.get(pinKey(pin));
								const value =
									result === undefined
										? "…"
										: result.missing
											? "not in scope"
											: result.unavailable
												? "unavailable"
												: result.value;
								return (
									<li key={pinKey(pin)} className="debug-item">
										<span className="debug-var-name">{pin.name}</span>
										<span> = </span>
										<span className="debug-var-value">{value}</span>
										{result !== undefined && result.typeName !== null ? (
											<span className="debug-var-type dimmed">
												{result.typeName}
											</span>
										) : null}
										<button
											type="button"
											className="debug-remove"
											aria-label={`Unpin ${pin.name}`}
											onClick={() => debug.unpinVariable(pin)}
										>
											×
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</div>
				<p className="debug-note dimmed">
					Expression evaluation is unavailable for Rust, so only pinned in-scope variables
					can be watched.
				</p>
			</section>

			<section className="debug-section debug-watchpoints">
				<div className="debug-section-head">
					<span className="label">watch points</span>
					<span className="debug-count">{debug.watchPoints.length}</span>
				</div>
				<div className="debug-scroll">
					{debug.watchPoints.length === 0 ? (
						<p className="debug-note">None. Stop, then press watch on a variable.</p>
					) : (
						<ul className="debug-list">
							{debug.watchPoints.map((watch) => (
								<li key={watch.dataId} className="debug-item">
									<span className="debug-pos" title={watch.description}>
										{watch.description}
									</span>
									<span className="debug-mem" title={watch.dataId}>
										{watch.dataId}
									</span>
									<button
										type="button"
										className="debug-remove"
										aria-label={`Remove ${watch.description}`}
										onClick={() => debug.removeWatchPoint(watch.dataId)}
									>
										×
									</button>
								</li>
							))}
						</ul>
					)}
				</div>
				<p className="debug-note">
					Evaluate is unavailable for Rust, so no watch expressions.
				</p>
			</section>

			<section className="debug-section debug-breakpoints">
				<div className="debug-section-head">
					<span className="label">breakpoints</span>
					<button
						type="button"
						className="button"
						disabled={!canAddBreakpoint}
						title={
							canAddBreakpoint ? "Use the top frame's file and line" : "Stop first"
						}
						onClick={debug.addBreakpoint}
					>
						Add breakpoint
					</button>
				</div>
				<div className="debug-scroll">
					{debug.breakpoints.length === 0 ? (
						<p className="debug-note">None. Click the editor gutter to set one.</p>
					) : (
						[...debug.breakpointsByPath.entries()]
							.sort(([left], [right]) => (left < right ? -1 : 1))
							.map(([path, rows]) => (
								<div key={path}>
									<div className="debug-scope-head" title={path}>
										{fileName(path)}
									</div>
									<ul className="debug-list">
										{rows.map((breakpoint) => (
											<BreakpointItem
												key={breakpoint.key}
												row={breakpoint}
												onEdit={(field, value) =>
													debug.setBreakpointField(
														breakpoint.path,
														breakpoint.line,
														field,
														value,
													)
												}
												onRemove={debug.removeBreakpoint}
											/>
										))}
									</ul>
								</div>
							))
					)}
				</div>
			</section>

			{debug.exceptionFilters.length === 0 || session === null ? null : (
				<section className="debug-section debug-exceptions">
					<div className="debug-section-head">
						<span className="label">exceptions</span>
						<span className="debug-count">{debug.exceptionFilters.length}</span>
					</div>
					<div className="debug-scroll">
						<ul className="debug-list">
							{debug.exceptionFilters.map((filter) => (
								<li key={filter.filter} className="debug-item">
									<label>
										<input
											type="checkbox"
											checked={debug.exceptionChecked.has(filter.filter)}
											onChange={(event) =>
												debug.toggleExceptionFilter(
													filter.filter,
													event.target.checked,
												)
											}
										/>
										<span>{filter.label}</span>
									</label>
								</li>
							))}
						</ul>
					</div>
				</section>
			)}

			{session === null ? null : (
				<>
					<section className="debug-section debug-pane-section">
						<div className="debug-section-head">
							<span className="label">memory</span>
							<span className="debug-mem">{memoryAddress ?? "no address"}</span>
						</div>
						<div className="debug-pane">
							<MemoryPane session={session} address={memoryAddress} />
						</div>
					</section>
					<section className="debug-section debug-pane-section">
						<div className="debug-section-head">
							<span className="label">disassembly</span>
							<span className="debug-mem">{disasmAddress ?? "no address"}</span>
						</div>
						<div className="debug-pane">
							<DisasmPane session={session} address={disasmAddress} />
						</div>
					</section>
				</>
			)}
		</aside>
	);
}
