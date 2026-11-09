import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/ui/App";
import AppErrorBoundary from "@/ui/app/AppErrorBoundary";
import { startupMark, startupPrint } from "@/lib/startupMarks";

startupMark("module-load");
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
