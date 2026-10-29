import type { NextConfig } from "next";

const config: NextConfig = {
	output: "export",
	trailingSlash: true,
	images: { unoptimized: true },
	/** The site imports the app's theme and data modules, so the workspace root is the repository. */
	turbopack: { root: new URL("..", import.meta.url).pathname },
};

export default config;
