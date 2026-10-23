import type { EnvVar } from "@/lib/project/api";

export const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function envProblem(env: EnvVar[]): string | null {
	let problem: string | null = null;
	const seen = new Set<string>();
	for (const row of env) {
		if (!NAME_RE.test(row.name)) {
			problem = `invalid env name: ${row.name === "" ? "(empty)" : row.name}`;
			break;
		}
		if (seen.has(row.name)) {
			problem = `duplicate env name: ${row.name}`;
			break;
		}
		seen.add(row.name);
	}
	return problem;
}
