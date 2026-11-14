import { Component, type ErrorInfo, type ReactNode } from "react";
import { logUiError } from "@/lib/log/api";
import CrashPanel from "@/ui/app/CrashPanel";

type Failure = { message: string; stack?: string };
export type State = { failure: Failure | null; logPath: string | null };

/**
 * Keeps a render error inside the shell instead of blanking the window.
 *
 * React unmounts the whole tree when a component throws without a boundary, so one bad value in a
 * panel left an empty frame with no chrome — the failure looked like the app refusing to start. The
 * boundary renders `CrashPanel` in its place, which names the error and can reload.
 *
 * The same failure goes to the crash log, because a reload discards the panel and the stack with
 * it. The write is fire-and-forget: a log that cannot be written must not replace the error the
 * panel is already showing, and the panel names the file once the answer arrives.
 *
 * Nest one around a region (the workspace, the overlays) and a throw there costs that region only;
 * the root boundary in `main.tsx` stays as the last resort.
 */
export default class AppErrorBoundary extends Component<
	{ children: ReactNode; region?: string },
	State
> {
	state: State = { failure: null, logPath: null };

	static getDerivedStateFromError(error: unknown): State {
		return { failure: { message: describe(error) }, logPath: null };
	}

	componentDidCatch(error: unknown, info: ErrorInfo): void {
		this.setState(failureState(error, info));
		void logUiError({
			name: nameOf(error),
			message: error instanceof Error ? error.message : describe(error),
			stack: error instanceof Error ? error.stack : undefined,
			componentStack: info.componentStack ?? undefined,
			region: this.props.region,
		}).then((logPath) => {
			if (logPath !== null) this.setState({ logPath });
		});
	}

	render() {
		const failure = this.state.failure;
		if (failure !== null) {
			return (
				<CrashPanel
					message={failure.message}
					stack={failure.stack}
					region={this.props.region}
					logPath={this.state.logPath ?? undefined}
				/>
			);
		}
		return this.props.children;
	}
}

/** What `componentDidCatch` records: the message, React's component stack, and no path yet. */
export function failureState(error: unknown, info: ErrorInfo): State {
	return {
		failure: { message: describe(error), stack: info.componentStack ?? undefined },
		logPath: null,
	};
}

/** The error as one line, so a non-Error throw still says something useful. */
export function describe(error: unknown): string {
	if (error instanceof Error) return `${error.name}: ${error.message}`;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error) ?? String(error);
	} catch {
		return String(error);
	}
}

/** The name the log records; a thrown non-Error has no constructor to borrow one from. */
function nameOf(error: unknown): string {
	return error instanceof Error ? error.name : "Thrown";
}
