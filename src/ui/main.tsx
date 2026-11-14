import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/ui/App";
import AppErrorBoundary from "@/ui/app/AppErrorBoundary";
import { installErrorLogging } from "@/lib/log/hooks";
import { startupMark, startupPrint } from "@/lib/startupMarks";

startupMark("module-load");
// Before the first render: a failure during startup, or one thrown inside a CodeMirror input
// handler, never reaches a React boundary and would otherwise leave nothing behind.
installErrorLogging();
const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
	<React.StrictMode>
		<AppErrorBoundary>
			<App />
		</AppErrorBoundary>
	</React.StrictMode>,
);
requestAnimationFrame(() => {
	startupMark("first-paint");
	// One place that prints the collected deltas.
	startupPrint("first-paint");
});
