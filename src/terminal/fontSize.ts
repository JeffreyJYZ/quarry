export const DEFAULT_FONT_SIZE = 11.5;
export const MIN_FONT_SIZE = 9;
export const MAX_FONT_SIZE = 20;
export const FONT_STEP = 1;

export function clampFontSize(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_FONT_SIZE;
	return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value));
}

export function increaseFontSize(current: number): number {
	return clampFontSize(current + FONT_STEP);
}

export function decreaseFontSize(current: number): number {
	return clampFontSize(current - FONT_STEP);
}

export function resetFontSize(): number {
	return DEFAULT_FONT_SIZE;
}

export function scrollbackText(lines: string[]): string {
	return lines.join("\n");
}

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

export function parseOsc7Cwd(data: string): string | null {
	let result: string | null = null;
	let i = 0;
	while (true) {
		const start = data.indexOf(`${ESC}]7;`, i);
		if (start === -1) break;
		let j = data.indexOf(BEL, start);
		let endMarkerLen = 1;
		if (j === -1) {
			const st = data.indexOf(`${ESC}\\`, start);
			if (st === -1) break;
			j = st;
			endMarkerLen = 2;
		}
		const body = data.slice(start + 4, j).trim();
		i = j + endMarkerLen;
		if (!body.startsWith("file://")) continue;
		let path = body.slice("file://".length);
		const slashIndex = path.indexOf("/");
		if (slashIndex >= 0) path = path.slice(slashIndex);
		try {
			result = decodeURIComponent(path);
		} catch {
			result = path;
		}
	}
	return result;
}
