import { sessionForContext } from "@/lib/lsp/context";
import { lspHover, lspImplementation, lspTypeDefinition } from "@/lib/project/api";
import { renderMarkdown } from "@/lib/editor/markdown";
import type { useWorkspace } from "@/ui/app/useWorkspace";

export type LspCommandHandlers = {
	workspaceSymbol: () => void;
	gotoImplementation: () => void;
	gotoTypeDefinition: () => void;
	quickDoc: () => void;
};

export function makeLspCommandHandlers(options: {
	workspace: ReturnType<typeof useWorkspace>;
	overlays: { setGotoMode: (mode: "class" | "symbol" | "recent") => void };
	activePath: string | null;
	cursor: { line: number; character: number } | null;
	onNotice?: (message: string | null) => void;
}): LspCommandHandlers {
	const { workspace, overlays, activePath, cursor, onNotice } = options;
	return {
		workspaceSymbol: () => overlays.setGotoMode("class"),
		gotoImplementation: () => {
			const session = sessionForContext(activePath);
			if (session === null || activePath === null || cursor === null) return;
			void (async () => {
				let locations: Awaited<ReturnType<typeof lspImplementation>> = [];
				try {
					locations = await lspImplementation(
						session,
						activePath,
						cursor.line,
						cursor.character,
					);
				} catch {
					locations = [];
				}
				if (locations.length === 0) {
					onNotice?.("No implementation found");
					return;
				}
				const first = locations[0];
				workspace.handleNavigate(
					first.path,
					first.range.start.line,
					first.range.start.character,
				);
			})();
		},
		gotoTypeDefinition: () => {
			const session = sessionForContext(activePath);
			if (session === null || activePath === null || cursor === null) return;
			void (async () => {
				let locations: Awaited<ReturnType<typeof lspTypeDefinition>> = [];
				try {
					locations = await lspTypeDefinition(
						session,
						activePath,
						cursor.line,
						cursor.character,
					);
				} catch {
					locations = [];
				}
				if (locations.length === 0) {
					onNotice?.("No type definition found");
					return;
				}
				const first = locations[0];
				workspace.handleNavigate(
					first.path,
					first.range.start.line,
					first.range.start.character,
				);
			})();
		},
		quickDoc: () => {
			const session = sessionForContext(activePath);
			if (session === null || activePath === null || cursor === null) return;
			void (async () => {
				let info: Awaited<ReturnType<typeof lspHover>> = null;
				try {
					info = await lspHover(session, activePath, cursor.line, cursor.character);
				} catch {
					info = null;
				}
				if (info === null) {
					onNotice?.("No documentation available");
					return;
				}
				const node = renderMarkdown(info.contents);
				const backdrop = document.createElement("div");
				backdrop.className = "goto-backdrop";
				const panel = document.createElement("div");
				panel.className = "goto-panel";
				panel.append(node);
				backdrop.append(panel);
				const close = () => {
					backdrop.remove();
					window.removeEventListener("keydown", onKey);
					document.removeEventListener("mousedown", onClick, true);
				};
				const onKey = (event: KeyboardEvent) => {
					if (event.key === "Escape") {
						event.preventDefault();
						close();
					}
				};
				const onClick = (event: MouseEvent) => {
					if (event.target === backdrop) close();
				};
				window.addEventListener("keydown", onKey);
				document.addEventListener("mousedown", onClick, true);
				document.body.append(backdrop);
			})();
		},
	};
}
