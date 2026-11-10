import { useCallback, useRef } from "react";
import { type FileBuffer, withBufferText } from "@/lib/project/buffer";

export type BufferTextOptions = {
	buffers: { current: FileBuffer[] };
	/** The tab the editor's own writer targets; the split pane names its file instead. */
	activePath: { current: string | null };
	setBuffers: (update: (current: FileBuffer[]) => FileBuffer[]) => void;
	/** A write that really changed the text, so a build report about it describes other text. */
	onTextChanged?: (path: string) => void;
};

/**
 * The two buffer writers, and the one rule they share.
 *
 * Typing replaces the one buffer it changed. The same text reported again — a disk reload echoing
 * back through the editor — leaves the array and every buffer in it untouched, and with them the
 * build findings that still describe that text. The split pane names its own file, so typing beside
 * the active tab can never overwrite the active tab's text.
 *
 * The options live in a ref so both writers keep one identity across the re-render every keystroke
 * causes, and the change is reported after the array is written: the buffer's text at call time is
 * still the previous one.
 */
export function useBufferText(options: BufferTextOptions): {
	handleChange: (value: string) => void;
	handleChangeFor: (path: string, value: string) => void;
} {
	const latest = useRef(options);
	latest.current = options;
	const write = useCallback((path: string | null, value: string) => {
		const { buffers, setBuffers, onTextChanged } = latest.current;
		const entry = path === null ? undefined : buffers.current.find((b) => b.path === path);
		setBuffers((current) => withBufferText(current, path, value));
		if (entry !== undefined && entry.text !== value) onTextChanged?.(entry.path);
	}, []);
	const activePath = options.activePath;
	return {
		handleChange: useCallback(
			(value: string) => write(activePath.current, value),
			[write, activePath],
		),
		handleChangeFor: useCallback((path: string, value: string) => write(path, value), [write]),
	};
}
