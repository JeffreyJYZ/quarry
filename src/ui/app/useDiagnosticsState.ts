import { useCallback, useMemo, useState } from "react";
import {
	combineDiagnostics,
	countSeverities,
	type DiagnosticMap,
	groupDiagnostics,
	withServerDiagnostics,
} from "@/lib/lsp/diagnostics";
import { useDiagnosticsFeed } from "@/lib/lsp/feed";
import type { Diagnostic } from "@/lib/project/api";
import { problemFiles } from "@/lib/problems/model";

/**
 * The two diagnostic sources, merged.
 *
 * The language server publishes per file and the build reports per run; a build's findings stay
 * until the next build, so a fixed file keeps its old error only until the compiler runs again.
 */
export function useDiagnosticsState(options: {
	root: string | null;
	onError: (message: string) => void;
}) {
	const [server, setServer] = useState<DiagnosticMap>(() => new Map());
	const [build, setBuild] = useState<DiagnosticMap>(() => new Map());

	const publish = useCallback((path: string, diagnostics: Diagnostic[]) => {
		setServer((current) => withServerDiagnostics(current, path, diagnostics));
	}, []);

	useDiagnosticsFeed({ root: options.root, onPublish: publish, onError: options.onError });

	const setBuildReport = useCallback((diagnostics: Diagnostic[]) => {
		setBuild(groupDiagnostics(diagnostics));
	}, []);

	const reset = useCallback(() => {
		setServer(new Map());
		setBuild(new Map());
	}, []);

	const diagnostics = useMemo(() => combineDiagnostics(server, build), [server, build]);
	const counts = useMemo(() => countSeverities(diagnostics), [diagnostics]);
	const files = useMemo(() => problemFiles(diagnostics), [diagnostics]);

	return { diagnostics, counts, files, publish, setBuildReport, reset };
}
