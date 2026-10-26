import type { MutableRefObject } from "react";
import { useRootSignals } from "@/lib/lsp/rootSignals";
import { useDocumentSync, useLspServers, type LspStatusMap } from "@/lib/lsp/session";
import { setLspContext } from "@/lib/lsp/context";
import type { ServerKind } from "@/lib/lsp/served";

export type LspWiringOptions = {
	root: string | null;
	activePath: string | null;
	activeText: string;
	report: (message: string) => void;
	overrides: Partial<Record<ServerKind, { path?: string; args?: string[] }>>;
	/** Kept in a ref so the editor guards read the live set without re-rendering. */
	runningRef: MutableRefObject<ReadonlySet<ServerKind>>;
};

/**
 * The language-server side of the shell: which servers a root needs, their sessions, the document
 * sync, and the running set the editor guards consult.
 */
export function useLspWiring(options: LspWiringOptions): LspStatusMap {
	const signals = useRootSignals(options.root);
	const statuses = useLspServers(options.root, signals, options.report, options.overrides);
	const running = new Set(
		(Object.keys(statuses) as ServerKind[]).filter((kind) => statuses[kind] != null),
	);
	options.runningRef.current = running;
	setLspContext(options.root, running);

	useDocumentSync({
		root: options.root,
		path: options.activePath,
		text: options.activeText,
		report: options.report,
		ready: running.size > 0,
		statuses,
	});

	return statuses;
}
