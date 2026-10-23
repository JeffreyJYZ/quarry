export const KIND_LABELS: Record<number, string> = {
	1: "file",
	2: "mod",
	3: "ns",
	4: "pkg",
	5: "class",
	6: "method",
	7: "prop",
	8: "field",
	9: "ctor",
	10: "enum",
	11: "interface",
	12: "fn",
	13: "var",
	14: "const",
	15: "str",
	16: "num",
	17: "bool",
	18: "arr",
	19: "obj",
	20: "key",
	21: "null",
	22: "enum",
	23: "struct",
	24: "event",
	25: "op",
	26: "type",
};

export function kindLabel(kind: number): string {
	return KIND_LABELS[kind] ?? "sym";
}
