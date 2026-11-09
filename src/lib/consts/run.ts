/** A shell-legal environment variable name, so a run configuration cannot be saved with a typo. */

export const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Output rows a run keeps before the oldest are dropped. */

export const MAX_RUN_LINES = 2000;
