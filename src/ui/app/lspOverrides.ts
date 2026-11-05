import type { ServerKind } from "@/lib/lsp/served";
import { splitArgs } from "@/lib/run/splitArgs";

/** The tool paths and arguments the settings pane holds, as the language-server wiring wants them. */
export type LspOverrides = Partial<Record<ServerKind, { path?: string; args?: string[] }>>;

/**
 * Settings in, overrides out.
 *
 * The conversion lives here so `useShell` stays inside the file-size limit and so the split-args rule
 * for these fields is stated once: both servers take a command line typed as one string.
 */
export function lspOverridesFrom(settings: {
	rustAnalyzerPath: string;
	rustAnalyzerArgs: string;
	clangdPath: string;
	clangdArgs: string;
}): LspOverrides {
	return {
		"rust-analyzer": {
			path: settings.rustAnalyzerPath,
			args: splitArgs(settings.rustAnalyzerArgs),
		},
		clangd: { path: settings.clangdPath, args: splitArgs(settings.clangdArgs) },
	};
}
