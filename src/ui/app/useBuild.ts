import { useCallback, useEffect, useRef, useState } from "react";
import { buildProject, type Diagnostic } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

/**
 * The Build action and the profile menu beside it.
 *
 * A build replaces the compiler half of the problem list; the diagnostics stay until the next one
 * runs, so a fixed file keeps its old error only until the compiler says otherwise.
 *
 * Opening another project cancels this hook's claim on a build that is already running: the result
 * describes a tree that is no longer on screen, and an indicator that keeps saying "building" while
 * the new project sits idle is a lie about what is happening.
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
	const buildingRef = useRef(false);
	const generation = useRef(0);

	// The new project starts with no build in flight, even if the previous one's command is still
	// running; the stale result is dropped by the generation check in `build`.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the reset runs on a root change only
	useEffect(() => {
		generation.current += 1;
		buildingRef.current = false;
		setBuilding(false);
	}, [root]);

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
		if (root === null || buildingRef.current) return;
		setMenuOpen(false);
		buildingRef.current = true;
		setBuilding(true);
		const mine = generation.current;
		const current = () => generation.current === mine;
		try {
			const result = await buildProject(root, profile);
			if (!current()) return;
			onDiagnostics(result.diagnostics);
			if (result.diagnostics.length === 0) onNotice(result.summary);
		} catch (error) {
			if (current()) onNotice(`Build failed: ${describeError(error)}`);
		} finally {
			if (current()) {
				buildingRef.current = false;
				setBuilding(false);
			}
		}
	}, [root, profile, onDiagnostics, onNotice]);

	return { building, build, menuOpen, setMenuOpen, splitRef, chevronRef };
}

export type BuildModel = ReturnType<typeof useBuild>;
