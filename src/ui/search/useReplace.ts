import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { SearchReport } from "@/lib/project/api";
import type { FileBuffer } from "@/lib/project/buffer";
import { describeError } from "@/lib/project/errors";
import { dirtyReplaceMessage, dirtyReplaceTargets } from "@/lib/search/dirty";
import {
	buildPreview,
	isPreviewStale,
	type PreviewSnapshot,
	type SearchOptions,
	searchFlags,
	transformQuery,
} from "@/lib/search/model";
import { replaceProject } from "@/lib/project/api";

export type SearchReplace = {
	showReplace: boolean;
	setShowReplace: Dispatch<SetStateAction<boolean>>;
	replacement: string;
	setReplacement: Dispatch<SetStateAction<string>>;
	preview: PreviewSnapshot | null;
	replaceSummary: string | null;
	doPreview: () => void;
	doReplaceAll: () => Promise<void>;
};

export function useReplace({
	root,
	trimmed,
	report,
	options,
	buffers,
	setBusy,
	setError,
}: {
	root: string;
	trimmed: string;
	report: SearchReport | null;
	options: SearchOptions;
	buffers: readonly FileBuffer[];
	setBusy: Dispatch<SetStateAction<boolean>>;
	setError: Dispatch<SetStateAction<string | null>>;
}): SearchReplace {
	const [showReplace, setShowReplace] = useState(false);
	const [replacement, setReplacement] = useState("");
	const [preview, setPreview] = useState<PreviewSnapshot | null>(null);
	const [replaceSummary, setReplaceSummary] = useState<string | null>(null);

	const doPreview = () => {
		if (report === null || trimmed === "") {
			return;
		}
		const built = buildPreview(
			report.matches.map((m) => ({ path: m.path, line: m.line, text: m.text })),
			trimmed,
			replacement,
			options,
		);
		setPreview({ query: trimmed, replacement, lines: built.lines, truncated: built.truncated });
		setReplaceSummary(null);
	};

	const doReplaceAll = async () => {
		if (isPreviewStale(preview, trimmed, replacement)) {
			setError("preview is stale: run preview again before replacing");
			return;
		}
		// The backend rewrites files straight from disk, so a dirty tab would be clobbered before
		// its text ever reached the disk. Refuse the whole replace and name every file at risk.
		const blocked = dirtyReplaceTargets(
			buffers,
			(report?.matches ?? []).map((match) => match.path),
		);
		if (blocked.length > 0) {
			setError(dirtyReplaceMessage(blocked));
			return;
		}
		const flags = searchFlags(options);
		setBusy(true);
		setError(null);
		try {
			const res = await replaceProject(
				root,
				transformQuery(trimmed, options),
				replacement,
				flags.caseSensitive,
				flags.fixedStrings,
			);
			const errPart = res.errors.length > 0 ? `; ${res.errors.length} errors` : "";
			setReplaceSummary(
				`${res.files_changed} files changed, ${res.replacements} replacements made${errPart}`,
			);
			if (res.errors.length > 0) {
				setError(res.errors.join("; "));
			}
		} catch (failure) {
			setError(describeError(failure));
		} finally {
			setBusy(false);
		}
	};

	return {
		showReplace,
		setShowReplace,
		replacement,
		setReplacement,
		preview,
		replaceSummary,
		doPreview,
		doReplaceAll,
	};
}
