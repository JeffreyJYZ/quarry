import { useCallback, useEffect, useRef, useState } from "react";
import { buildProject, type Diagnostic } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

/**
 * The Build action and the profile menu beside it.
 *
 * A build replaces the compiler half of the problem list; the diagnostics stay until the next one
 * runs, so a fixed file keeps its old error only until the compiler says otherwise.
 */
export function useBuild(options: {
	root: string | null;
	profile: "debug" | "release";
	onDiagnostics: (diagnostics: Diagnostic[]) => void;
	onNotice: (message: string) => void;
}) {
	const { root, profile, onDiagnostics, onNotice } = options;
	const [building, setBuilding] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const splitRef = useRef<HTMLDivElement | null>(null);
	const chevronRef = useRef<HTMLButtonElement | null>(null);

	// The profile menu closes on a click outside it and on Escape, like the recents menu.
	useEffect(() => {
		if (!menuOpen) return;
		const handlePointer = (event: MouseEvent) => {
			const target = event.target as Node | null;
			if (splitRef.current?.contains(target) === true) return;
			setMenuOpen(false);
		};
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setMenuOpen(false);
		};
		document.addEventListener("mousedown", handlePointer);
		window.addEventListener("keydown", handleKey, true);
		return () => {
			document.removeEventListener("mousedown", handlePointer);
			window.removeEventListener("keydown", handleKey, true);
		};
	}, [menuOpen]);

	const build = useCallback(async () => {
		if (root === null || building) return;
		setMenuOpen(false);
		setBuilding(true);
		try {
			const result = await buildProject(root, profile);
			onDiagnostics(result.diagnostics);
			if (result.diagnostics.length === 0) onNotice(result.summary);
		} catch (error) {
			onNotice(`Build failed: ${describeError(error)}`);
		} finally {
			setBuilding(false);
		}
	}, [root, building, profile, onDiagnostics, onNotice]);

	return { building, build, menuOpen, setMenuOpen, splitRef, chevronRef };
}

export type BuildModel = ReturnType<typeof useBuild>;
