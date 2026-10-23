import type { EditState } from "./FileTreeTypes";

export type CreateInputRowProps = {
	depth: number;
	parent: string;
	kind: EditState["kind"];
	onCommit: (parent: string, name: string, kind: EditState["kind"]) => void;
	onCancel: () => void;
};

export function CreateInputRow({ depth, parent, kind, onCommit, onCancel }: CreateInputRowProps) {
	const paddingLeft = `${8 + depth * 12}px`;
	return (
		<div className="tree-row edit-row" style={{ paddingLeft }}>
			<input
				className="tree-input"
				ref={(node) => node?.focus()}
				placeholder={kind === "create-file" ? "new file" : "new folder"}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						const value = (event.target as HTMLInputElement).value.trim();
						onCommit(parent, value, kind);
					} else if (event.key === "Escape") {
						onCancel();
					}
				}}
				onBlur={() => onCancel()}
			/>
		</div>
	);
}
