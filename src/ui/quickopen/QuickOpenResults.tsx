import type { RefObject } from "react";
import { useStableCallback } from "@/lib/react/useStableCallback";
import { QuickOpenRow } from "./QuickOpenRow";

export function QuickOpenResults({
	root,
	primary,
	active,
	openPaths,
	recentPaths,
	mainList,
	ranked,
	onActive,
	onPick,
	listRef,
}: {
	root: string;
	primary: string;
	active: number;
	openPaths: ReadonlySet<string>;
	recentPaths: string[];
	mainList: string[];
	ranked: string[];
	onActive: (index: number) => void;
	onPick: (path: string) => void;
	listRef: RefObject<HTMLDivElement | null>;
}) {
	// One handler per event, holding the latest closure, so a memoised row is not re-rendered by a
	// parent that rebuilds its callbacks on every query keystroke.
	const pick = useStableCallback((path: string) => onPick(path));
	const activate = useStableCallback((index: number) => onActive(index));
	const recentCount = recentPaths.length;
	return (
		<div className="search-results" ref={listRef}>
			{primary.trim() === "" ? (
				<>
					{recentCount === 0 ? null : (
						<>
							<div className="quick-open-group-label">Recent</div>
							{recentPaths.map((path, index) => (
								<QuickOpenRow
									key={`recent-${path}`}
									path={path}
									root={root}
									index={index}
									active={index === active}
									isOpen={openPaths.has(path)}
									onSelect={pick}
									onHover={activate}
								/>
							))}
						</>
					)}
					<div className="quick-open-group-label">All files</div>
					{mainList.map((path, i) => {
						const globalIndex = recentCount + i;
						return (
							<QuickOpenRow
								key={path}
								path={path}
								root={root}
								index={globalIndex}
								active={globalIndex === active}
								isOpen={openPaths.has(path)}
								onSelect={pick}
								onHover={activate}
							/>
						);
					})}
				</>
			) : (
				ranked.map((path, index) => (
					<QuickOpenRow
						key={path}
						path={path}
						root={root}
						index={index}
						active={index === active}
						isOpen={openPaths.has(path)}
						query={primary}
						onSelect={pick}
						onHover={activate}
					/>
				))
			)}
		</div>
	);
}
