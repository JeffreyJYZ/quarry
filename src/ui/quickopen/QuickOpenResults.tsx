import type { RefObject } from "react";
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
	const recentCount = recentPaths.length;
	return (
		<div className="search-results" ref={listRef}>
			{primary.trim() === "" ? (
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
							onSelect={() => onPick(path)}
							onHover={() => onActive(index)}
						/>
					))}
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
								onSelect={() => onPick(path)}
								onHover={() => onActive(globalIndex)}
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
						onSelect={() => onPick(path)}
						onHover={() => onActive(index)}
					/>
				))
			)}
		</div>
	);
}
