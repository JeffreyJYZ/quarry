import { plural } from "@/lib/problems/model";
import type { GitStatus } from "@/lib/project/api";

/**
 * The branch and what it owes its upstream: ahead, behind, and the number of changed entries.
 *
 * Nothing renders without a branch name, which is what a detached HEAD and a directory that is not
 * a repository both report.
 */
export default function StatusGit({ git }: { git: GitStatus | null }) {
	if (git === null || git.branch === null) return null;
	return (
		<span
			className="status-git"
			title={`${git.branch} · ${git.ahead} ahead · ${git.behind} behind · ${git.entries.length} changes`}
		>
			<span className="status-branch">
				<span className="branch-glyph" aria-hidden="true" />
				<span className="branch-name">{git.branch}</span>
			</span>
			{git.ahead > 0 ? <span className="status-ahead">↑{git.ahead}</span> : null}
			{git.behind > 0 ? <span className="status-behind">↓{git.behind}</span> : null}
			{git.entries.length > 0 ? (
				<span className="status-changes">{plural(git.entries.length, "change")}</span>
			) : null}
		</span>
	);
}
