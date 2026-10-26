export type CiRun = {
	status: string;
	conclusion: string | null;
	url: string;
	databaseId: number;
};

export type CiVerdict =
	| { proceed: true; state: string; message: string }
	| { proceed: false; state: string; message: string; failingJobs: string[] };

export function ciVerdict(sha: string, run: CiRun | null, failingJobs: string[] = []): CiVerdict {
	if (run === null) {
		return {
			proceed: true,
			state: "absent",
			message: `CI absent for ${sha} — proceeding on the local gate`,
		};
	}
	if (run.status !== "completed") {
		const state = run.status === "queued" ? "queued" : "running";
		return {
			proceed: true,
			state,
			message: `CI ${state} for ${sha} — proceeding on the local gate`,
		};
	}
	if (run.conclusion !== "success") {
		const state = run.conclusion === "cancelled" ? "cancelled" : "failed";
		return {
			proceed: false,
			state,
			message:
				state === "cancelled"
					? `CI cancelled for ${sha}: ${run.url}`
					: `CI failed for ${sha}: ${run.url}`,
			failingJobs,
		};
	}
	return { proceed: true, state: "success", message: `CI green for ${sha}` };
}
