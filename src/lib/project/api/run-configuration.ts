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

/**
 * One project's run form, as the shell last left it.
 *
 * It uses the same field shapes as a saved configuration, so the form's args stay the raw text
 * `splitArgs` splits and `env` stays pairs in form order. `root` is the key: the form remembers a
 * project, which is why a hand-set program comes back when the same project is opened again.
 */
export type RunFormEntry = {
	root: string;
	program: string;
	args: string;
	cwd: string;
	env: [string, string][];
};
