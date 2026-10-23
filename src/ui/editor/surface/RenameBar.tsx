/** The inline rename box: Enter applies, Escape cancels. */
export default function RenameBar({
	value,
	onChange,
	onSubmit,
	onCancel,
}: {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	onCancel: () => void;
}) {
	return (
		<div className="cm-rename-bar">
			<input
				className="rename-input"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						onSubmit();
					}
					if (event.key === "Escape") {
						event.preventDefault();
						onCancel();
					}
				}}
			/>
		</div>
	);
}
