type StatusRailProps = {
	message: string;
	isError: boolean;
};

/** The bare rail the panel shows while its first status is loading or has failed. */
export default function StatusRail({ message, isError }: StatusRailProps) {
	return (
		<aside className="rail">
			<div className="rail-head">
				<span className="label">Source control</span>
			</div>
			<p className={isError ? "empty error" : "empty"}>{message}</p>
		</aside>
	);
}
