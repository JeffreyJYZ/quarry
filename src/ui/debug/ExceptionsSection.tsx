import type { DebugController } from "@/lib/debug/session";

/** Exception filters, only while a session is live; the section is absent otherwise. */
export default function ExceptionsSection({
	debug,
	session,
}: {
	debug: DebugController;
	session: string | null;
}) {
	if (debug.exceptionFilters.length === 0 || session === null) {
		return null;
	}

	return (
		<section className="debug-section debug-exceptions">
			<div className="debug-section-head">
				<span className="label">exceptions</span>
				<span className="debug-count">{debug.exceptionFilters.length}</span>
			</div>
			<div className="debug-scroll">
				<ul className="debug-list">
					{debug.exceptionFilters.map((filter) => (
						<li key={filter.filter} className="debug-item">
							<label>
								<input
									type="checkbox"
									checked={debug.exceptionChecked.has(filter.filter)}
									onChange={(event) =>
										debug.toggleExceptionFilter(
											filter.filter,
											event.target.checked,
										)
									}
								/>
								<span>{filter.label}</span>
							</label>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
