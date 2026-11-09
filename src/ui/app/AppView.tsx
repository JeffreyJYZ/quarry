import AppBody from "@/ui/app/AppBody";
import AppTopBar from "@/ui/app/AppTopBar";
import AppErrorBoundary from "@/ui/app/AppErrorBoundary";
import OverlaysMount from "@/ui/app/OverlaysMount";
import RunDebugWidget from "@/ui/app/RunDebugWidget";
import { Suspense, lazy } from "react";
const UpdateSlot = lazy(() => import("@/ui/updates/UpdateSlot"));
import { useWhatsNew } from "@/ui/updates/useWhatsNew";
import type { ShellModel } from "@/ui/app/useShell";

/** The shell's frame: title bar, notice line, the workspace, and everything floating over it. */
export default function AppView({ model }: { model: ShellModel }) {
	useWhatsNew(() => model.overlays.setNotesOpen(true));

	return (
		<div className="shell">
			<AppTopBar
				model={model}
				right={
					<>
						<RunDebugWidget
							runDebug={model.runDebug}
							onEditConfigurations={() => {
								model.runs.openPanel();
								model.panels.showRun();
							}}
						/>
						<Suspense fallback={null}>
							<UpdateSlot />
						</Suspense>
					</>
				}
			/>
			{model.notice === null ? null : (
				<div className="notice" role="status">
					<span className="notice-text" title={model.notice}>
						{model.notice}
					</span>
					<button
						type="button"
						className="notice-close"
						onClick={() => model.setNotice(null)}
					>
						dismiss
					</button>
				</div>
			)}
			{/* One region per boundary: a throw in the workspace must not take the panels with it. */}
			<AppErrorBoundary region="the workspace">
				<AppBody model={model} />
			</AppErrorBoundary>
			<AppErrorBoundary region="a panel">
				<OverlaysMount model={model} />
			</AppErrorBoundary>
		</div>
	);
}
