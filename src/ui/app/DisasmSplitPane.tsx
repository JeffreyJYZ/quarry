import { Suspense, lazy } from "react";
import { PANEL_LIMITS } from "@/lib/consts/layout";
import Splitter from "@/ui/layout/Splitter";
import type { DisasmSplit } from "@/ui/app/useStableProps";

const DisasmPane = lazy(() => import("@/ui/debug/memory/DisasmPane"));

/**
 * The assembly split beside the active file, or nothing when it is closed.
 *
 * Its title names the file the editor shows, because the assembly is that file compiled; the width
 * belongs to the shell's panel state and the handle only reports a new one.
 */
export default function DisasmSplitPane({
	split,
	fileName,
}: {
	split: DisasmSplit;
	fileName: string;
}) {
	if (split === null) return null;
	return (
		<>
			<Splitter
				axis="x"
				invert
				value={split.width}
				min={PANEL_LIMITS.disasmWidth.min}
				max={PANEL_LIMITS.disasmWidth.max}
				label="Resize disassembly"
				onChange={split.onWidthChange}
			/>
			<aside
				className="editor-split"
				aria-label="Disassembly"
				style={{ width: `${split.width}px` }}
			>
				<header className="editor-split-head">
					<span className="editor-split-title">{fileName} (assembly)</span>
					<button
						type="button"
						className="editor-split-close"
						aria-label="Close disassembly"
						title="Close disassembly"
						onClick={split.onClose}
					>
						×
					</button>
				</header>
				<div className="editor-split-body">
					<Suspense fallback={null}>
						<DisasmPane
							session={split.session}
							address={split.address}
							frameId={split.frameId}
						/>
					</Suspense>
				</div>
			</aside>
		</>
	);
}
