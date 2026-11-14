import type { LaunchPreset, RunTarget } from "@/lib/project/api";

/** One row of the run widget's dropdown. */
export type TargetEntry = { value: string; label: string; disabled?: boolean };

/**
 * The dropdown's rows: detected targets first, then launch presets.
 *
 * A target's `value` is its id and a preset's is its name, so a preset named exactly like a target
 * id would otherwise produce two rows carrying the same value, and the select would show one of
 * them while selecting the other.
 */
export function targetEntries(
	targets: RunTarget[],
	presets: Pick<LaunchPreset, "name">[],
): TargetEntry[] {
	const entries: TargetEntry[] = targets.map((target) => ({
		value: target.id,
		label: target.label,
	}));
	const taken = new Set(entries.map((entry) => entry.value));
	for (const preset of presets) {
		if (taken.has(preset.name)) continue;
		taken.add(preset.name);
		entries.push({ value: preset.name, label: preset.name });
	}
	return entries;
}

/**
 * Which target the Run and Debug buttons act on.
 *
 * A remembered id wins while it still exists — a detected target or a preset, since a preset the
 * user picked must survive the list being read again — so a project with several binaries does not
 * jump back to the first one on every reload. With no memory, one target is the answer, then Cargo's
 * default binary (the bin named after its package), then the first row, which is what makes the very
 * first click work with no configuration at all. A preset is never chosen without being picked: it
 * names a program the project itself does not build.
 */
export function preferredTargetId(
	targets: RunTarget[],
	remembered: string | null,
	presets: Pick<LaunchPreset, "name">[] = [],
): string | null {
	const known = new Set(targets.map((target) => target.id));
	for (const preset of presets) known.add(preset.name);
	if (remembered !== null && known.has(remembered)) {
		return remembered;
	}
	if (targets.length === 0) return null;
	if (targets.length === 1) return targets[0].id;
	const defaultBinary = targets.find(
		(target) => target.kind === "cargo" && target.target === target.package,
	);
	return (defaultBinary ?? targets[0]).id;
}
