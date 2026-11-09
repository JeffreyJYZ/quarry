/**
 * One transport request at a time.
 *
 * The rail's disabled rules follow `status`, which only leaves `stopped` once the adapter has
 * answered, so a second press or key repeat inside that window would send a second request. Every
 * resume/step goes through this gate instead: while one is in flight the rest are dropped.
 */
export type TransportGate = {
	readonly busy: boolean;
	run: (task: () => Promise<void>) => Promise<void>;
};

export function createTransportGate(): TransportGate {
	let busy = false;
	return {
		get busy() {
			return busy;
		},
		async run(task) {
			if (busy) return;
			busy = true;
			try {
				await task();
			} finally {
				busy = false;
			}
		},
	};
}
