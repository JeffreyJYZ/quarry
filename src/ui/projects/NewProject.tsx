import { type JSX, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { createProject } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import "@/ui/projects/newProject.css";

export type NewProjectProps = {
	open: boolean;
	/** Where the dialog starts: the location used last time, remembered in settings. */
	initialParent: string;
	onParentChange: (parent: string) => void;
	onClose: () => void;
	/** Called with the new project's root once the scaffold exists on disk. */
	onCreated: (root: string) => void;
};

type Kind = "rust-bin" | "rust-lib" | "c-cmake" | "cpp-cmake";

const KINDS: { value: Kind; label: string; hint: string }[] = [
	{ value: "rust-bin", label: "Rust binary", hint: "cargo run prints a greeting" },
	{ value: "rust-lib", label: "Rust library", hint: "one function and one passing test" },
	{ value: "c-cmake", label: "C (CMake)", hint: "CMakeLists plus src/main.c" },
	{ value: "cpp-cmake", label: "C++ (CMake)", hint: "CMakeLists plus src/main.cpp" },
];

/** The language standards each kind offers, in the order CLion lists them. */
const STANDARDS: Record<Kind, { value: string; label: string }[]> = {
	"rust-bin": [
		{ value: "2024", label: "Edition 2024" },
		{ value: "2021", label: "Edition 2021" },
	],
	"rust-lib": [
		{ value: "2024", label: "Edition 2024" },
		{ value: "2021", label: "Edition 2021" },
	],
	"c-cmake": [
		{ value: "17", label: "C17" },
		{ value: "11", label: "C11" },
		{ value: "23", label: "C23" },
	],
	"cpp-cmake": [
		{ value: "20", label: "C++20" },
		{ value: "17", label: "C++17" },
		{ value: "23", label: "C++23" },
	],
};

function defaultStandard(kind: Kind): string {
	return STANDARDS[kind][0].value;
}

/** The directory a new project is created in, with a trailing separator removed. */
function parentOf(path: string): string {
	return path.replace(/[\\/]+$/, "");
}

function joinPath(parent: string, name: string): string {
	const separator = parent.includes("\\") && !parent.includes("/") ? "\\" : "/";
	return `${parentOf(parent)}${separator}${name.trim()}`;
}

/**
 * New project dialog: pick a parent directory, a name and a kind, then let the backend scaffold it.
 *
 * The dialog never creates anything itself; it calls `create_project` and hands the resulting root to
 * the caller, which opens it through the ordinary open path so recent projects and settings follow.
 */
export default function NewProject({
	open: isOpen,
	initialParent,
	onParentChange,
	onClose,
	onCreated,
}: NewProjectProps): JSX.Element | null {
	const [parent, setParent] = useState(initialParent);
	const [name, setName] = useState("");
	const [kind, setKind] = useState<Kind>("rust-bin");
	const [standard, setStandard] = useState(defaultStandard("rust-bin"));
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const nameRef = useRef<HTMLInputElement>(null);
	const parentRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!isOpen) return;
		setError(null);
		setParent(initialParent);
		(parent === "" ? parentRef : nameRef).current?.focus();
	}, [initialParent, isOpen, parent]);

	if (!isOpen) return null;

	const target = parent !== "" && name.trim() !== "" ? joinPath(parent, name) : null;
	const canCreate = target !== null && !creating;

	const chooseParent = (next: string) => {
		setParent(next);
		onParentChange(next);
	};

	const submit = async () => {
		if (!canCreate || target === null) return;
		setCreating(true);
		setError(null);
		try {
			const info = await createProject(parentOf(parent), name.trim(), kind, standard);
			setName("");
			onCreated(info.root);
		} catch (cause) {
			setError(describeError(cause));
		} finally {
			setCreating(false);
		}
	};

	return (
		<div
			className="newproject-backdrop"
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				className="newproject-panel"
				role="dialog"
				aria-modal="true"
				aria-labelledby="newproject-title"
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						onClose();
					}
				}}
			>
				<header className="newproject-head">
					<span className="label" id="newproject-title">
						new project
					</span>
					<button type="button" className="newproject-close" onClick={onClose}>
						close
					</button>
				</header>

				<div className="newproject-body">
					<div className="newproject-row">
						<label htmlFor="newproject-parent">Location</label>
						<div className="newproject-location">
							<input
								id="newproject-parent"
								ref={parentRef}
								type="text"
								value={parent}
								placeholder="/path/to/parent"
								spellCheck={false}
								onChange={(event) => chooseParent(event.target.value)}
							/>
							<button
								type="button"
								className="button"
								onClick={() => {
									void (async () => {
										try {
											const picked = await open({
												directory: true,
												multiple: false,
												title: "Choose a parent folder",
											});
											if (typeof picked === "string") chooseParent(picked);
										} catch (cause) {
											setError(describeError(cause));
										}
									})();
								}}
							>
								Browse
							</button>
						</div>
					</div>

					<div className="newproject-row">
						<label htmlFor="newproject-name">Name</label>
						<input
							id="newproject-name"
							ref={nameRef}
							type="text"
							value={name}
							placeholder="my-project"
							spellCheck={false}
							onChange={(event) => setName(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") void submit();
							}}
						/>
					</div>

					<fieldset className="newproject-kinds">
						<legend className="label">Kind</legend>
						{KINDS.map((option) => (
							<label key={option.value} className="newproject-kind">
								<input
									type="radio"
									name="newproject-kind"
									value={option.value}
									checked={kind === option.value}
									onChange={() => {
										setKind(option.value);
										setStandard(defaultStandard(option.value));
									}}
								/>
								<span className="newproject-kind-label">{option.label}</span>
								<span className="newproject-kind-hint">{option.hint}</span>
							</label>
						))}
					</fieldset>

					<div className="newproject-row">
						<span className="label">Language standard</span>
						<div
							className="newproject-standards"
							role="group"
							aria-label="Language standard"
						>
							{STANDARDS[kind].map((option) => (
								<button
									key={option.value}
									type="button"
									className={
										standard === option.value
											? "newproject-standard active"
											: "newproject-standard"
									}
									aria-pressed={standard === option.value}
									onClick={() => setStandard(option.value)}
								>
									{option.label}
								</button>
							))}
						</div>
					</div>

					<p className="newproject-target">{target ?? "Choose a location and a name"}</p>
					{error === null ? null : (
						<p className="newproject-error" role="alert">
							{error}
						</p>
					)}
				</div>

				<footer className="newproject-foot">
					<span className="newproject-hint">
						Creates the folder and starter files, then opens it.
					</span>
					<div className="newproject-actions">
						<button type="button" className="button" onClick={onClose}>
							Cancel
						</button>
						<button
							type="button"
							className="button newproject-create"
							disabled={!canCreate}
							onClick={() => void submit()}
						>
							{creating ? "Creating…" : "Create project"}
						</button>
					</div>
				</footer>
			</div>
		</div>
	);
}
