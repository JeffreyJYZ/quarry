/**
 * The GCC row's own control: the same clangd told only where the database is.
 *
 * A fixture that passes either way no longer measures anything, so the control is what says the
 * `--query-driver` was load-bearing. Where the platform cannot discriminate, that is said rather
 * than passed off as a check.
 */

import type { AnalysisProbe } from "../fixtures/types";
import type { GccHarness } from "../gcc";

export async function driverControl(
	harness: GccHarness,
	probes: AnalysisProbe[],
	tree: string,
): Promise<{ detail: string; broken: boolean }> {
	const control = await harness.analyse(probes, [`--compile-commands-dir=${tree}`]);
	const blind = control.some((measurement, index) => {
		const hover = measurement.hover ?? "";
		const wanted = probes[index]?.expect ?? "";
		return !hover.includes(wanted) || measurement.diagnostics.length > 0;
	});
	if (blind) {
		return {
			detail: "control      PASS  without --query-driver the same clangd cannot read GCC's standard header",
			broken: false,
		};
	}
	if (harness.requiresDriverControl) {
		return {
			detail: "control      FAIL  the same clangd answers without --query-driver, so this fixture cannot tell a queried driver from an unqueried one",
			broken: true,
		};
	}
	// Both compilers read the same C++ standard library here, so clangd finds its headers with
	// no query at all: the row still measures the product's arguments, but this machine cannot
	// prove the query is what made the analysis work. Named, never passed off as a check.
	return {
		detail: "control      note  the same clangd answers without --query-driver, because this platform's clang and GCC share one C++ standard library, so the control cannot discriminate here",
		broken: false,
	};
}
