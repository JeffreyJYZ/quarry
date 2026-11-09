import type { ServerKind } from "@/lib/lsp/served";
import type { MutableRefObject } from "react";

import type { LspStatusMap } from "@/lib/lsp/session";
import { useDiagnosticsState } from "@/ui/app/useDiagnosticsState";
import { useLspWiring } from "@/ui/app/useLspWiring";

export type ShellDiagnosticsOptions = {
	root: string | null;
	activePath: string | null;
	activeText: string;
	report: (message: string) => void;
	overrides: Partial<Record<ServerKind, { path?: string; args?: string[] }>>;
	runningRef: MutableRefObject<ReadonlySet<ServerKind>>;
	restartToken: number;
	onRestarted: (token: number) => void;
	onError: (message: string) => void;
};

/**
 * The language servers and the diagnostics they publish, as one unit.
 *
 * They are built together because the store has to hear about a server that stops: `running` is
 * what tells it which published findings just lost the program that produced them, and the same
 * end-of-session event takes the status chip down.
 */
export function useShellDiagnostics(options: ShellDiagnosticsOptions): {
	lspStatuses: LspStatusMap;
	diagnostics: ReturnType<typeof useDiagnosticsState>;
} {
	const lsp = useLspWiring({
		root: options.root,
		activePath: options.activePath,
		activeText: options.activeText,
		report: options.report,
		overrides: options.overrides,
		onRestarted: options.onRestarted,
		runningRef: options.runningRef,
		restartToken: options.restartToken,
	});
	const diagnostics = useDiagnosticsState({
		root: options.root,
		running: lsp.running,
		onServerEnd: lsp.markEnded,
		onError: options.onError,
	});
	return { lspStatuses: lsp.statuses, diagnostics };
}
