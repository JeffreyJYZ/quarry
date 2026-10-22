import DisasmPane from "@/debug/memory/DisasmPane";
import MemoryPane from "@/debug/memory/MemoryPane";
import type { DebugController, VariableRow } from "@/debug/session";
import { fileName } from "@/problems/model";
import type { DapVariable } from "@/project/api";

/** How many characters of a program path the panel keeps when it truncates from the left. */
const PROGRAM_CHARS = 36;

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
};

/** One container's rows; recursion only happens through an expanded parent row. */
function VariableList({ variables, containerRef, prefix, depth, debug }: VariableListProps) {
	return (
		<>
			{variables.map((variable, index) => {
				const row: VariableRow = {
					key: `${prefix}/${index}`,
					containerRef,
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
	const open = expandable && debug.expanded.has(row.key);
	const children = open ? (debug.children.get(row.variablesReference) ?? null) : null;
	const selected = debug.selectedVariable !== null && debug.selectedVariable.key === row.key;
	const watching = debug.status === "stopped";

	return (
		<>
			<div className={selected ? "debug-var selected" : "debug-var"}>
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
					<span className="debug-var-value">{row.value}</span>
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
			</div>
			{open && children !== null ? (
				<VariableList
					variables={children}
					containerRef={row.variablesReference}
					prefix={row.key}
					depth={row.depth + 1}
					debug={debug}
				/>
			) : null}
		</>
	);
}

/**
 * The right-hand debugger column: presets and launch, transport controls, stack, variables, watch
 * points, breakpoints and the memory/disassembly panes. It renders state; the hook does the work.
 */
export default function DebugPanel({ debug }: { debug: DebugController }) {
	const view = debug.stopView;
	const top = view === null ? null : (view.frames[0] ?? null);
	const activeFrame =
		view === null ? null : (view.frames.find((frame) => frame.id === view.frameId) ?? top);
	const memoryAddress =
		debug.selectedVariable?.memoryReference ?? activeFrame?.instructionPointer ?? null;
	const disasmAddress = activeFrame?.instructionPointer ?? null;
	const stopped = debug.status === "stopped";
	const session = debug.sessionId;
	const canAddBreakpoint = stopped && top !== null && top.source !== null;

	return (
		<aside className="debug" aria-label="Debugger">
			<div className="debug-head">
				<span className="label">debug</span>
				<span className={`debug-status ${debug.status}`}>{debug.status}</span>
			</div>

			{debug.error === null ? null : (
				<p className="debug-error" role="status">
					{debug.error}
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
						view.frames.map((frame) => (
							<button
								key={frame.id}
								type="button"
								className={
									frame.id === view.frameId ? "debug-frame active" : "debug-frame"
								}
								title={frame.source ?? undefined}
								onClick={() => debug.selectFrame(frame.id)}
							>
								<span className="debug-frame-name">{frame.name}</span>
								<span className="debug-frame-pos">
									{frame.source === null
										? "—"
										: `${fileName(frame.source)}:${frame.line}`}
								</span>
							</button>
						))
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
								/>
							</div>
						))
					)}
				</div>
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
											<li
												key={breakpoint.key}
												className={
													breakpoint.verified === false
														? "debug-item unverified"
														: breakpoint.verified === null
															? "debug-item pending"
															: "debug-item"
												}
												title={breakpoint.message ?? breakpoint.path}
											>
												<span className="debug-pos">
													{fileName(breakpoint.path)}:{breakpoint.line}
												</span>
												<span className="debug-mem">
													{breakpoint.verified === false
														? "unverified"
														: breakpoint.verified === null
															? "pending"
															: "verified"}
												</span>
												<button
													type="button"
													className="debug-remove"
													aria-label={`Remove breakpoint at ${fileName(breakpoint.path)}:${breakpoint.line}`}
													onClick={() =>
														debug.removeBreakpoint(
															breakpoint.path,
															breakpoint.line,
														)
													}
												>
													×
												</button>
											</li>
										))}
									</ul>
								</div>
							))
					)}
				</div>
			</section>

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
