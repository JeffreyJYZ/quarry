import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Branch } from "@/lib/project/api";

type BranchBarProps = {
	branch: string;
	isRepo: boolean;
	open: boolean;
	onToggle: () => void;
	onClose: () => void;
	filter: string;
	onFilter: (value: string) => void;
	index: number;
	setIndex: Dispatch<SetStateAction<number>>;
	branches: Branch[];
	switching: boolean;
	onSwitch: (branch: string) => void;
	error: string | null;
	filterRef: RefObject<HTMLInputElement | null>;
};

/** The rail head: the current branch and the filterable menu that checks another one out. */
export default function BranchBar({
	branch,
	isRepo,
	open,
	onToggle,
	onClose,
	filter,
	onFilter,
	index,
	setIndex,
	branches,
	switching,
	onSwitch,
	error,
	filterRef,
}: BranchBarProps) {
	const filtered = branches.filter((entry) =>
		entry.name.toLowerCase().includes(filter.toLowerCase()),
	);
	return (
		<div className="rail-head" style={{ position: "relative" }}>
			<span className="label">Source control</span>
			{isRepo ? (
				<button type="button" className="git-branch git-branch-btn" onClick={onToggle}>
					{branch}
				</button>
			) : (
				<span className="git-branch">{branch}</span>
			)}
			{open && isRepo ? (
				<div className="git-branch-menu">
					<input
						ref={filterRef}
						className="git-branch-filter"
						value={filter}
						onChange={(event) => onFilter(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								event.preventDefault();
								onClose();
								return;
							}
							if (event.key === "ArrowDown") {
								event.preventDefault();
								setIndex((current) =>
									Math.min(current + 1, Math.max(0, filtered.length - 1)),
								);
								return;
							}
							if (event.key === "ArrowUp") {
								event.preventDefault();
								setIndex((current) => Math.max(current - 1, 0));
								return;
							}
							if (event.key === "Enter") {
								event.preventDefault();
								const target = filtered[index];
								if (target !== undefined && !switching) {
									onSwitch(target.name);
								}
							}
						}}
						placeholder="Filter branches"
					/>
					<ul className={`git-branch-list${switching ? " git-branch-list-busy" : ""}`}>
						{filtered.map((entry, itemIndex) => (
							<li key={entry.name}>
								<button
									type="button"
									className={`git-branch-option${itemIndex === index ? " git-branch-option-active" : ""}`}
									disabled={switching}
									onClick={() => onSwitch(entry.name)}
								>
									<span className="git-branch-mark">
										{entry.current ? "●" : " "}
									</span>
									{entry.name}
								</button>
							</li>
						))}
					</ul>
					{error !== null ? <p className="git-branch-error">{error}</p> : null}
				</div>
			) : null}
		</div>
	);
}
