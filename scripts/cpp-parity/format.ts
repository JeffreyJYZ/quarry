/**
 * How the product's answers are spelled in the report: one line each, quoted the way a reader can
 * paste back.
 */

import { basename } from "node:path";

/** How much of a hover goes into a report line; the signature is in the first clause. */
const CLIP = 140;

/** The first non-empty line of a tool's output, clipped to a detail line. */
export function firstLine(text: string): string {
	const line = text.split("\n").find((candidate) => candidate.trim() !== "") ?? "";
	return line.trim().slice(0, 200);
}

/**
 * A failure's own words: CMake puts "CMake Error at CMakeLists.txt:7 (message):" on one line and the
 * message on the next, so the first line alone names the site and hides the reason. Six lines with
 * their own spacing collapsed: the report clips a wall of text, and a wrapped message is often four.
 */
export function firstError(text: string): string {
	const lines = text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");
	return lines.slice(0, 6).join(" ").slice(0, 400);
}

/** A hover as a report token: `null`, or the quoted first 140 characters of it. */
export function describe(hover: string | null): string {
	if (hover === null) return "null";
	return JSON.stringify(hover.length <= CLIP ? hover : `${hover.slice(0, CLIP)}…`);
}

/** An argv as a readable command, with the fixture root written as `.`. */
export function commandLine(root: string, argv: string[]): string {
	const program = basename(argv[0] ?? "cmake");
	return [program, ...argv.slice(1)].join(" ").split(root).join(".");
}

/** A compile command as a report token: the driver and the flags that decide its language. */
export function describeArguments(args: string[] | null): string {
	if (args === null) return "no compile command";
	const language = args.filter(
		(arg) => arg.startsWith("-std=") || arg.startsWith("--std=") || arg === "-x",
	);
	const driver = basename(args[0] ?? "");
	return `${driver} ${language.join(" ")}`.trim();
}

/** The `-O`/`-g` flags in a compile command, as one quoted fragment for a report line. */
export function describeFlags(args: string[] | null): string {
	if (args === null) return "no compile command";
	const flags = args.filter((arg) => arg.startsWith("-O") || arg === "-g").join(" ");
	return flags === "" ? "no -O/-g flags" : JSON.stringify(flags);
}
