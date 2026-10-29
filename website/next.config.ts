import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

/** The app's version, read from the repository root. The docs ship with the app, so they match. */
function appVersion(): string {
	try {
		const pkg = JSON.parse(
			readFileSync(new URL("../package.json", import.meta.url), "utf8"),
		) as { version: string };
		return pkg.version;
	} catch {
		return "0.0.0";
	}
}

const config: NextConfig = {
	output: "export",
	trailingSlash: true,
	images: { unoptimized: true },
	env: { QUARRY_VERSION: appVersion() },
	/** Two lockfiles live in this repository; the site is its own workspace root. */
	turbopack: { root: import.meta.dirname },
};

export default config;
