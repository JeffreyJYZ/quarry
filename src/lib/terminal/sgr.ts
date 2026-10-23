import { basicColour, readColour } from "@/lib/terminal/colours";

export type Run = {
	text: string;
	fg: string | null;
	bg: string | null;
	bold: boolean;
	dim: boolean;
	italic: boolean;
	underline: boolean;
};

export const BLANK: Omit<Run, "text"> = {
	fg: null,
	bg: null,
	bold: false,
	dim: false,
	italic: false,
	underline: false,
};

/**
 * Applies one SGR parameter list to the current style.
 *
 * Parameters are stateful (a `1` stays bold until `22`), which is why this returns the next style
 * rather than a per-run decision.
 */
export function applySgr(style: Omit<Run, "text">, params: number[]): Omit<Run, "text"> {
	let out = { ...style };
	for (let index = 0; index < params.length; index += 1) {
		const param = params[index];
		if (param === 0) {
			out = { ...BLANK };
			continue;
		}
		if (param === 1) out.bold = true;
		else if (param === 2) out.dim = true;
		else if (param === 3) out.italic = true;
		else if (param === 4) out.underline = true;
		else if (param === 22) {
			out.bold = false;
			out.dim = false;
		} else if (param === 23) out.italic = false;
		else if (param === 24) out.underline = false;
		else if (param >= 30 && param <= 37) out.fg = basicColour(param - 30);
		else if (param >= 90 && param <= 97) out.fg = basicColour(param - 90 + 8);
		else if (param === 39) out.fg = null;
		else if (param >= 40 && param <= 47) out.bg = basicColour(param - 40);
		else if (param >= 100 && param <= 107) out.bg = basicColour(param - 100 + 8);
		else if (param === 49) out.bg = null;
		else if (param === 38 || param === 48) {
			const { colour, next } = readColour(params, index + 1);
			if (param === 38) out.fg = colour;
			else out.bg = colour;
			index = next - 1;
		}
	}
	return out;
}
