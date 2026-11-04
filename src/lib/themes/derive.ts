/**
 * Colours the theme does not spell out, derived from the ones it does.
 *
 * A semantic token kind still needs its own colour: a class field that looks exactly like a local
 * variable is the thing CLion never does. Editing eight themes by hand would drift and would not
 * cover an imported theme, so the hue is derived — a large rotation away from the theme's own type
 * colour, which keeps the saturation and lightness (and so the contrast against the background)
 * that the theme was tuned for, while guaranteeing the two never collide.
 */

type Hsl = { h: number; s: number; l: number };

export function hexToHsl(hex: string): Hsl | null {
	const value = hex.trim();
	const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
	const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
	if (short === null && long === null) return null;
	const parts =
		short !== null
			? [short[1] + short[1], short[2] + short[2], short[3] + short[3]]
			: [long![1], long![2], long![3]];
	const [r, g, b] = parts.map((part) => Number.parseInt(part, 16) / 255);
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const light = (max + min) / 2;
	if (max === min) return { h: 0, s: 0, l: light };
	const delta = max - min;
	const s = light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
	let h: number;
	if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
	else if (max === g) h = ((b - r) / delta + 2) * 60;
	else h = ((r - g) / delta + 4) * 60;
	return { h, s, l: light };
}

const channel = (n: number): number => {
	const x = Math.round(n * 255);
	return Math.min(255, Math.max(0, x));
};

export function hslToHex({ h, s, l }: Hsl): string {
	const hue = ((h % 360) + 360) % 360;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
	const m = l - c / 2;
	const [r, g, b] =
		hue < 60
			? [c, x, 0]
			: hue < 120
				? [x, c, 0]
				: hue < 180
					? [0, c, x]
					: hue < 240
						? [0, x, c]
						: hue < 300
							? [x, 0, c]
							: [c, 0, x];
	return `#${[r, g, b]
		.map((value) =>
			channel(value + m)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

/** A colour at least `degrees` away in hue, keeping the lightness and never losing saturation. */
export function rotateHue(hex: string, degrees: number, minSaturation = 0.35): string {
	const hsl = hexToHsl(hex);
	if (hsl === null) return hex;
	const saturation = Math.max(hsl.s, minSaturation);
	return hslToHex({ h: hsl.h + degrees, s: saturation, l: hsl.l });
}

/**
 * The two token kinds the app highlights but no theme names.
 *
 * The base is the theme's `type` colour, which is a real hue in every shipped theme; the two
 * rotations are far apart from each other and from the base, so field, parameter and type are three
 * distinguishable colours whatever the palette.
 */
export function derivedEditorColours(tokens: { type: string; identifier: string }): {
	field: string;
	parameter: string;
	staticField: string;
	enumMember: string;
} {
	const base = hexToHsl(tokens.type);
	const baseHsl = base !== null && base.s > 0.12 ? tokens.type : tokens.identifier;
	return {
		field: rotateHue(baseHsl, 118),
		parameter: rotateHue(baseHsl, -96),
		// CLion splits a member three ways — instance field, static field, enum constant — and clangd
		// says which through the token's kind and its `static` modifier. Each gets its own hue rather
		// than a shade, so they are told apart at a glance, not by comparing brightness.
		staticField: rotateHue(baseHsl, 178),
		enumMember: rotateHue(baseHsl, 40),
	};
}
