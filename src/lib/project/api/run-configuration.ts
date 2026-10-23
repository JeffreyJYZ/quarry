/**
 * One saved run panel: a snapshot of the form, never a hidden override.
 *
 * `args` is the args field verbatim so the run path splits it with the same quote-aware `splitArgs`
 * the form uses; `env` keeps the form's row order as `[name, value]` pairs.
 */
export type RunConfiguration = {
	name: string;
	program: string;
	args: string;
	cwd: string;
	env: [string, string][];
};
