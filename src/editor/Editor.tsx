export type EditorProps = {
	/** Absolute path of the open file, or null for an empty buffer. */
	path: string | null;
	value: string;
	onChange: (value: string) => void;
};

/**
 * Editor surface. Unit U5 owns this file's body: mount CodeMirror 6 with a dark theme and Rust/C/C++
 * highlighting, keep `value` as the source of truth, and report every change through `onChange`.
 * This stub only keeps the tree compiling.
 */
export default function Editor({ path, value }: EditorProps) {
	return (
		<pre className="editor-stub" data-path={path ?? ""}>
			{value}
		</pre>
	);
}
