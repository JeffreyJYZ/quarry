import type { DraftPreset } from "@/lib/debug/presets";

/** The `initCommands` line that makes Rust `Vec`/`String` pretty-print; without it they arrive raw. */
const RUST_PRETTY_HINT =
	"Rust pretty printing needs: command script import <sysroot>/lib/rustlib/etc/lldb_lookup.py";

/** One editable launch preset: the identity fields, the build command and the init commands. */
export default function PresetRow({
	draft,
	onChange,
	onMoveUp,
	onMoveDown,
	onRemove,
	onDuplicate,
}: {
	draft: DraftPreset;
	onChange: (changes: Partial<DraftPreset>) => void;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onRemove: () => void;
	onDuplicate: () => void;
}) {
	return (
		<div>
			<div className="debug-row debug-row-wrap">
				<input
					className="debug-input"
					value={draft.name}
					placeholder="name"
					onChange={(event) => onChange({ name: event.target.value })}
				/>
				<input
					className="debug-input"
					value={draft.program}
					placeholder="program"
					onChange={(event) => onChange({ program: event.target.value })}
				/>
				<input
					className="debug-input"
					value={draft.args}
					placeholder="args"
					onChange={(event) => onChange({ args: event.target.value })}
				/>
				<input
					className="debug-input"
					value={draft.cwd}
					placeholder="cwd"
					onChange={(event) => onChange({ cwd: event.target.value })}
				/>
				<label>
					<input
						type="checkbox"
						checked={draft.stopOnEntry}
						onChange={(event) => onChange({ stopOnEntry: event.target.checked })}
					/>
					stop
				</label>
				<button type="button" className="button" onClick={onMoveUp}>
					Up
				</button>
				<button type="button" className="button" onClick={onMoveDown}>
					Down
				</button>
				<button type="button" className="button" onClick={onRemove}>
					Remove
				</button>
				<button type="button" className="button" onClick={onDuplicate}>
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
					onChange={(event) => onChange({ build: event.target.value })}
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
					onChange={(event) => onChange({ initCommands: event.target.value })}
				/>
			</div>
			<p className="debug-note dimmed">{RUST_PRETTY_HINT}</p>
		</div>
	);
}
