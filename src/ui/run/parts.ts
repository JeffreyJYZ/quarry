import type { EnvVar } from "@/lib/project/api";
import { NAME_RE } from "@/lib/consts/run";

export { NAME_RE } from "@/lib/consts/run";

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
