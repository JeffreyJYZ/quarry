import { useEffect, useState } from "react";
import Editor from "@/editor/Editor";
import { type ToolchainReport, toolchains, version } from "@/project/api";
import "./styles.css";

export default function App() {
	const [report, setReport] = useState<ToolchainReport | null>(null);
	const [appVersion, setAppVersion] = useState("");

	useEffect(() => {
		toolchains().then(setReport, () => setReport(null));
		version().then(setAppVersion, () => setAppVersion(""));
	}, []);

	return (
		<div className="shell">
			<header className="titlebar">
				<span className="wordmark">quarry</span>
				<span className="crumbs">no project open</span>
			</header>

			<div className="body">
				<aside className="rail">
					<span className="label">explorer</span>
					<p className="empty">Nothing loaded.</p>
				</aside>

				<main className="canvas">
					{/* STUB: unit U4 replaces this layout with the project flow. */}
					<Editor path={null} value="" onChange={() => {}} />
				</main>
			</div>

			<footer className="statusbar">
				<span>quarry {appVersion || "0.1.0"}</span>
				<span>
					{report ? `${report.tools.length} tools probed` : "toolchains: probing"}
				</span>
			</footer>
		</div>
	);
}
