import AppBody from "@/ui/app/AppBody";
import AppTopBar from "@/ui/app/AppTopBar";
import OverlaysMount from "@/ui/app/OverlaysMount";
import UpdateSlot from "@/ui/updates/UpdateSlot";
import type { ShellModel } from "@/ui/app/useShell";

/** The shell's frame: title bar, notice line, the workspace, and everything floating over it. */
export default function AppView({ model }: { model: ShellModel }) {
	return (
		<div className="shell">
			<AppTopBar model={model} right={<UpdateSlot />} />
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
			<AppBody model={model} />
			<OverlaysMount model={model} />
		</div>
	);
}
