import type { EditorView } from "@codemirror/view";
import { formatDocument, formatterFor } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

/** The format action: ask which formatter this file has, then run it over the whole document. */
export function useFormatDocument(options: {
	viewRef: { current: EditorView | null };
	rootRef: { current: string | null };
	pathRef: { current: string | null };
	onNotice: { current: ((message: string | null) => void) | null };
}) {
	const { viewRef, rootRef, pathRef, onNotice } = options;

	return async (): Promise<string | null> => {
		const view = viewRef.current;
		const currentRoot = rootRef.current;
		const currentPath = pathRef.current;
		if (view === null || currentRoot === null || currentPath === null) return null;
		const notify = onNotice.current;
		let formatter = "";
		try {
			formatter = await formatterFor(currentPath);
		} catch (error) {
			notify?.(describeError(error));
			return null;
		}
		if (formatter === "") {
			const ext = currentPath.includes(".")
				? currentPath.slice(currentPath.lastIndexOf(".") + 1)
				: "";
			notify?.(`No formatter for ${ext}`);
			return null;
		}
		try {
			return await formatDocument(currentRoot, currentPath, view.state.doc.toString());
		} catch (error) {
			notify?.(describeError(error));
			return null;
		}
	};
}
