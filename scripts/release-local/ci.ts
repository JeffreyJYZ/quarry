/**
 * The CI verdict for the commit being released.
 *
 * A failed or cancelled run blocks the release; a queued or running one does not, because the local
 * gate repeats the same steps and the build itself is the wait.
 */

import { ciVerdict } from "./../ci-status";
import { fail, log, run } from "./process";

export function checkCi(sha: string): void {
	if (process.argv.includes("--skip-ci")) {
		log(`WARNING: skipping CI check for ${sha} (--skip-ci)`);
		return;
	}
	const raw = run("gh", [
		"run",
		"list",
		"--workflow",
		"CI",
		"--commit",
		sha,
		"--limit",
		"1",
		"--json",
		"conclusion,status,databaseId,headSha,url",
	]).trim();
	const runs = JSON.parse(raw) as {
		status: string;
		conclusion: string | null;
		url: string;
		databaseId: number;
	}[];
	const ciRun = runs[0] ?? null;
	let failingJobs: string[] = [];
	if (ciRun !== null && ciRun.status === "completed" && ciRun.conclusion !== "success") {
		const viewRaw = run("gh", [
			"run",
			"view",
			String(ciRun.databaseId),
			"--json",
			"jobs",
		]).trim();
		const view = JSON.parse(viewRaw) as {
			jobs: { name: string; conclusion: string | null }[];
		};
		failingJobs = view.jobs
			.filter((job) => job.conclusion !== "success" && job.conclusion !== null)
			.map((job) => job.name);
	}
	const verdict = ciVerdict(sha, ciRun, failingJobs);
	if (!verdict.proceed) {
		if (verdict.failingJobs.length > 0) {
			fail(`${verdict.message} — failing jobs: ${verdict.failingJobs.join(", ")}`);
		}
		fail(verdict.message);
	}
	log(verdict.message);
}
