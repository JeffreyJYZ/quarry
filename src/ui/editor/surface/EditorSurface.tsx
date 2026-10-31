import type { RefObject } from "react";
import { useEffect } from "react";
import type { CodeAction } from "@/lib/project/api";
import ContextMenu from "@/ui/components/ContextMenu";
import CodeActionMenu from "@/ui/editor/surface/CodeActionMenu";
import RenameBar from "@/ui/editor/surface/RenameBar";
import SearchBar from "@/ui/editor/surface/SearchBar";
import SignatureHelpView from "@/ui/editor/surface/SignatureHelp";
import type { useEditorContextMenu } from "@/ui/editor/useEditorContextMenu";
import type { useEditorSearch } from "@/ui/editor/useEditorSearch";
import type { useRenamePanel } from "@/ui/editor/useRenamePanel";
import type { useSignatureHelp } from "@/ui/editor/useSignatureHelp";

/**
 * The editor's box and everything that floats over it: find, rename, code actions, signature help,
 * right-click menu.
 *
 * They all anchor to the same host element and none of them is part of the document, so they live in
 * one component. The editor above keeps one view's lifecycle; this keeps the chrome, which is the
 * split that lets either side stay readable.
 *
 * The context menu listens on the host node rather than through a JSX handler: the whole surface is a
 * pointer target, not an interactive control, and CodeMirror owns the editable region inside it.
 */
export default function EditorSurface({
	hostRef,
	search,
	rename,
	code,
	sig,
	menu,
}: {
	hostRef: RefObject<HTMLDivElement | null>;
	search: ReturnType<typeof useEditorSearch>;
	rename: ReturnType<typeof useRenamePanel>;
	/** Only what the menu draws: the list, its open flag, and the picker. */
	code: {
		codeActions: CodeAction[];
		codeMenuOpen: boolean;
		apply: (action: CodeAction) => void;
	};
	sig: ReturnType<typeof useSignatureHelp>;
	menu: ReturnType<typeof useEditorContextMenu>;
}) {
	const openMenu = menu.open;

	useEffect(() => {
		const node = hostRef.current;
		if (node === null) return;
		const onContext = (event: MouseEvent) => openMenu(event);
		node.addEventListener("contextmenu", onContext);
		return () => node.removeEventListener("contextmenu", onContext);
	}, [hostRef, openMenu]);

	return (
		<div className="editor-host" ref={hostRef} style={{ position: "relative" }}>
			{search.searchOpen ? <SearchBar search={search} /> : null}
			{rename.renameOpen ? (
				<RenameBar
					value={rename.renameValue}
					onChange={rename.setRenameValue}
					onSubmit={rename.submit}
					onCancel={() => rename.setRenameOpen(false)}
				/>
			) : null}
			{code.codeMenuOpen && code.codeActions.length > 0 ? (
				<CodeActionMenu actions={code.codeActions} onPick={code.apply} />
			) : null}
			{sig.sigHelp !== null && sig.sigCoords !== null ? (
				<SignatureHelpView help={sig.sigHelp} anchor={sig.sigCoords} />
			) : null}
			{menu.state === null ? null : (
				<ContextMenu
					x={menu.state.x}
					y={menu.state.y}
					items={menu.items(menu.state)}
					onClose={menu.close}
				/>
			)}
		</div>
	);
}
