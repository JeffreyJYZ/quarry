import "./styles.css";

const stack = [
	["parser", "clangd · rust-analyzer"],
	["debugger", "lldb-dap"],
	["format", "clang-format · rustfmt"],
];

export default function App() {
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
					<span className="label">outline</span>
					<p className="empty">Nothing loaded.</p>
				</aside>

				<main className="canvas">
					<div className="welcome">
						<h1>Open a Rust or C/C++ project</h1>
						<p>
							quarry detects <code>Cargo.toml</code>, <code>CMakeLists.txt</code> and{" "}
							<code>compile_commands.json</code>, then attaches the language server
							for that project.
						</p>
						<ul className="stack">
							{stack.map(([role, tool]) => (
								<li key={role}>
									<span className="label">{role}</span>
									<span className="value">{tool}</span>
								</li>
							))}
						</ul>
						<p className="note">Scaffold only — the project model lands in P0.</p>
					</div>
				</main>
			</div>

			<footer className="statusbar">
				<span>quarry 0.1.0</span>
				<span>toolchains detected at launch</span>
			</footer>
		</div>
	);
}
