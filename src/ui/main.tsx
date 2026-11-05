import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/ui/App";
import AppErrorBoundary from "@/ui/app/AppErrorBoundary";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<AppErrorBoundary>
			<App />
		</AppErrorBoundary>
	</React.StrictMode>,
);
