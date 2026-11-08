import { Component, type ErrorInfo, type ReactNode } from "react";
import CrashPanel from "@/ui/app/CrashPanel";

type Failure = { message: string; stack?: string };
type State = { failure: Failure | null };

/**
 * Keeps a render error inside the shell instead of blanking the window.
 *
 * React unmounts the whole tree when a component throws without a boundary, so one bad value in a
 * panel left an empty frame with no chrome — the failure looked like the app refusing to start. The
 * boundary renders `CrashPanel` in its place, which names the error and can reload.
 */
export default class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
	state: State = { failure: null };

	static getDerivedStateFromError(error: unknown): State {
		return { failure: { message: describe(error) } };
	}

	componentDidCatch(error: unknown, info: ErrorInfo): void {
		this.setState({
			failure: { message: describe(error), stack: info.componentStack ?? undefined },
		});
	}

	render() {
		const failure = this.state.failure;
		if (failure !== null) {
			return <CrashPanel message={failure.message} stack={failure.stack} />;
		}
		return this.props.children;
	}
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
