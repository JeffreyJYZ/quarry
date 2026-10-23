import type { DebugController } from "@/lib/debug/session";
import { pinKey } from "@/lib/debug/watch";

/** Pinned variables with the value the last stop produced; pinning needs a stopped session. */
export function PinsSection({ debug }: { debug: DebugController }) {
	return (
		<section className="debug-section debug-pins">
			<div className="debug-section-head">
				<span className="label">watch</span>
				<span className="debug-count">{debug.pins.length}</span>
			</div>
			<div className="debug-scroll">
				{debug.pins.length === 0 ? (
					<p className="debug-note">None. Stop, then press pin on a variable.</p>
				) : (
					<ul className="debug-list">
						{debug.pins.map((pin) => {
							const result = debug.pinResults.get(pinKey(pin));
							const value =
								result === undefined
									? "…"
									: result.missing
										? "not in scope"
										: result.unavailable
											? "unavailable"
											: result.value;
							return (
								<li key={pinKey(pin)} className="debug-item">
									<span className="debug-var-name">{pin.name}</span>
									<span> = </span>
									<span className="debug-var-value">{value}</span>
									{result !== undefined && result.typeName !== null ? (
										<span className="debug-var-type dimmed">
											{result.typeName}
										</span>
									) : null}
									<button
										type="button"
										className="debug-remove"
										aria-label={`Unpin ${pin.name}`}
										onClick={() => debug.unpinVariable(pin)}
									>
										×
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>
			<p className="debug-note dimmed">
				Expression evaluation is unavailable for Rust, so only pinned in-scope variables can
				be watched.
			</p>
		</section>
	);
}

/** Data breakpoints added from a variable row; each is a `dataId` with its description. */
export function WatchPointsSection({ debug }: { debug: DebugController }) {
	return (
		<section className="debug-section debug-watchpoints">
			<div className="debug-section-head">
				<span className="label">watch points</span>
				<span className="debug-count">{debug.watchPoints.length}</span>
			</div>
			<div className="debug-scroll">
				{debug.watchPoints.length === 0 ? (
					<p className="debug-note">None. Stop, then press watch on a variable.</p>
				) : (
					<ul className="debug-list">
						{debug.watchPoints.map((watch) => (
							<li key={watch.dataId} className="debug-item">
								<span className="debug-pos" title={watch.description}>
									{watch.description}
								</span>
								<span className="debug-mem" title={watch.dataId}>
									{watch.dataId}
								</span>
								<button
									type="button"
									className="debug-remove"
									aria-label={`Remove ${watch.description}`}
									onClick={() => debug.removeWatchPoint(watch.dataId)}
								>
									×
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
			<p className="debug-note">Evaluate is unavailable for Rust, so no watch expressions.</p>
		</section>
	);
}
