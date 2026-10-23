import "@/ui/quickopen/quickopen.css";
import { QuickOpenResults } from "./QuickOpenResults";
import { useQuickOpen } from "./useQuickOpen";
import { recordRecent } from "./parts";

export type Props = {
	root: string;
	openPaths: ReadonlySet<string>;
	onOpen: (path: string) => void;
	onClose: () => void;
};

export default function QuickOpen({ root, openPaths, onOpen, onClose }: Props) {
	const quick = useQuickOpen({ root, onOpen, onClose });

	return (
		<div className="search-palette" role="dialog" aria-label="Quick open">
			<div className="search-head">
				<span className="label">open</span>
				<input
					ref={quick.inputRef}
					className="search-input"
					value={quick.query}
					placeholder="file name"
					aria-label="Quick open"
					spellCheck={false}
					autoComplete="off"
					onChange={(event) => {
						quick.setQuery(event.target.value);
						quick.setActive(0);
					}}
					onKeyDown={(event) => {
						if (event.key === "ArrowDown") {
							event.preventDefault();
							quick.move(1);
							return;
						}
						if (event.key === "ArrowUp") {
							event.preventDefault();
							quick.move(-1);
							return;
						}
						if (event.key === "Home") {
							event.preventDefault();
							quick.jump("start");
							return;
						}
						if (event.key === "End") {
							event.preventDefault();
							quick.jump("end");
							return;
						}
						if (event.key === "Enter") {
							event.preventDefault();
							quick.submit();
						}
					}}
				/>
				<button
					type="button"
					className="search-toggle"
					title="Refresh files"
					onClick={() => void quick.fetchFiles(true)}
				>
					refresh
				</button>
				<span className="search-hint">enter</span>
			</div>
			{quick.isFilterActive ? (
				<p className="search-state" role="status">
					filter active: {quick.filter.trim()}
				</p>
			) : null}
			{quick.error !== null ? (
				<p className="search-state error" role="status">
					{quick.error}
				</p>
			) : quick.busy ? (
				<p className="search-state" role="status">
					indexing…
				</p>
			) : quick.files.length === 0 ? (
				<p className="search-state" role="status">
					No files indexed
				</p>
			) : quick.displayList.length === 0 ? (
				<p className="search-state" role="status">
					No matches
				</p>
			) : (
				<QuickOpenResults
					root={root}
					primary={quick.primary}
					active={quick.active}
					openPaths={openPaths}
					recentPaths={quick.recentPaths}
					mainList={quick.mainList}
					ranked={quick.ranked}
					onActive={quick.setActive}
					onPick={(path) => {
						recordRecent(path);
						onOpen(path);
						onClose();
					}}
					listRef={quick.listRef}
				/>
			)}
			<div className="search-foot">
				<span>↑↓ move</span>
				<span>enter open</span>
				<span>esc close</span>
			</div>
		</div>
	);
}

export { recordRecent } from "./parts";
