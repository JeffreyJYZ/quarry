import type { EditState } from "./FileTreeTypes";
import { indent } from "./FileTreeIcons";

export type CreateInputRowProps = {
	depth: number;
	parent: string;
	kind: EditState["kind"];
	onCommit: (parent: string, name: string, kind: EditState["kind"]) => void;
	onCancel: () => void;
};

/**
 * The new-file / new-folder field, drawn where the entry will appear.
 *
 * One empty caret slot sits before the field, so it starts just past the disclosure column. At the raw
 * indent it read as level with the folder above; past the glyph column it over-indented.
 */
export function CreateInputRow({ depth, parent, kind, onCommit, onCancel }: CreateInputRowProps) {
	return (
		<div className="tree-row edit-row" style={indent(depth)}>
			<span className="tree-caret-slot" aria-hidden="true" />
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
