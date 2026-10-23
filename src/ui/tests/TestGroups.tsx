import type { TestReport } from "@/lib/project/api";
import type { TestGroup } from "./parts";
import { TestRow } from "./TestRow";

export function TestGroups({
	groups,
	results,
	running,
	collapsedGroups,
	onToggleGroup,
	highlighted,
	onRun,
	emptyMessage,
}: {
	groups: TestGroup[];
	results: ReadonlyMap<string, TestReport>;
	running: ReadonlySet<string>;
	collapsedGroups: ReadonlySet<string>;
	onToggleGroup: (binary: string) => void;
	highlighted: number;
	onRun: (name: string) => void;
	emptyMessage: string;
}) {
	if (groups.length === 0) {
		return <p className="problems-empty">{emptyMessage}</p>;
	}
	let index = 0;
	return (
		<>
			{groups.map((group) => {
				const collapsed = collapsedGroups.has(group.binary);
				const startIndex = index;
				index += group.tests.length;
				return (
					<div key={group.binary} className="tests-group">
						<div className="tests-group-head">
							<button
								type="button"
								className="tests-group-toggle"
								aria-expanded={!collapsed}
								onClick={() => onToggleGroup(group.binary)}
							>
								<span
									className={collapsed ? "tests-caret" : "tests-caret open"}
									aria-hidden="true"
								/>
								<span className="tests-binary" title={group.binary}>
									{group.binary}
								</span>
							</button>
							<span className="tests-group-count">{group.tests.length}</span>
						</div>
						{collapsed ? null : (
							<ul className="tests-list">
								{group.tests.map((item, i) => (
									<TestRow
										key={`${group.binary}::${item.name}`}
										item={item}
										result={results.get(item.name)}
										running={running.has(item.name)}
										highlighted={highlighted === startIndex + i}
										onRun={onRun}
									/>
								))}
							</ul>
						)}
					</div>
				);
			})}
		</>
	);
}
