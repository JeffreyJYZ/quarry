import "@/ui/app/crash.css";

/**
 * What the window shows when the shell throws while rendering.
 *
 * Without this, a render error leaves the window empty: no chrome, no message, nothing to click, and
 * the only way out is to know that the app has to be relaunched. The panel says what happened, names
 * the component React blamed, and offers the one action that helps.
 */
export default function CrashPanel({ message, stack }: { message: string; stack?: string }) {
	return (
		<div className="crash">
			<div className="crash-panel">
				<h1 className="crash-title">quarry stopped drawing this window</h1>
				<p className="crash-message">{message}</p>
				<pre className="crash-stack">{stack ?? "No stack was reported."}</pre>
				<div className="crash-actions">
					<button
						type="button"
						className="button"
						onClick={() => window.location.reload()}
					>
						Reload the window
					</button>
				</div>
				<p className="crash-hint">
					Reloading reopens the last project and its files. If it happens again, the
					details above are what a bug report needs.
				</p>
			</div>
		</div>
	);
}
