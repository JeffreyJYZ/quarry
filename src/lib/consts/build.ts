import type { BuildProfile } from "@/lib/settings/model";

/** The two build profiles the split button offers, in menu order. */
export const BUILD_PROFILE_CHOICES: { value: BuildProfile; label: string }[] = [
	{ value: "debug", label: "Debug" },
	{ value: "release", label: "Release" },
];
