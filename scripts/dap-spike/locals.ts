/**
 * The frame's variables: what the adapter calls each local, what its children are, and whether the
 * Rust types arrive pretty-printed or as raw structs.
 *
 * A synthetic Rust view lists elements (`[0]`, `0`); the raw view lists the struct's own fields
 * (`buf`, `len`) — that difference is the formatter reading.
 */

import { KNOWN_BYTES, KNOWN_STRING } from "./constants";
import type { Child, Context, Json, Local } from "./state";
import type { Stop } from "./stop";

export interface LocalsState {
	scopes: Json[];
	localsRef: number;
	locals: Local[];
	vecChildren: Child[];
	stringChildren: Child[];
	optionChildren: Child[];
	pointer?: Local;
	counter?: Local;
}

function findVariable(vars: Local[], name: string): Local | undefined {
	return vars.find((v) => v.name === name);
}

async function childNames(ctx: Context, ref: number | undefined): Promise<Child[]> {
	if (!ref || ref <= 0) return [];
	const children = await ctx.client.send("variables", { variablesReference: ref });
	return ((children.variables as Array<Json> | undefined) ?? []).map((c) => ({
		name: String(c.name),
		value: String(c.value),
		variablesReference: Number(c.variablesReference ?? 0),
	}));
}

export async function readLocals(ctx: Context, stop: Stop): Promise<LocalsState> {
	const { client, report, measure } = ctx;
	const frameId = Number(stop.frames[0]?.id ?? 0);
	const scopesResult = await client.send("scopes", { frameId });
	const scopes = (scopesResult.scopes as Array<Json> | undefined) ?? [];
	report.scopes = scopes.map((s) => ({ name: s.name, hint: s.presentationHint ?? null }));
	const localsScope =
		scopes.find((s) => s.presentationHint === "locals") ??
		scopes.find((s) => /local/i.test(String(s.name))) ??
		scopes[0];
	if (!localsScope) throw new Error("no scopes returned");
	const localsRef = Number(localsScope.variablesReference);
	const variablesResult = await client.send("variables", { variablesReference: localsRef });
	const variables = (variablesResult.variables as Array<Json> | undefined) ?? [];
	const locals: Local[] = variables.map((v) => ({
		name: String(v.name),
		value: String(v.value),
		type: String(v.type ?? ""),
		variablesReference: Number(v.variablesReference ?? 0),
	}));
	report.locals = locals;

	const vec = findVariable(locals, "v");
	const string = findVariable(locals, "s");
	const option = findVariable(locals, "o");
	const pointer = findVariable(locals, "raw");
	const counter = findVariable(locals, "n");
	report.renderings = {
		vec: vec?.value ?? null,
		vecType: vec?.type ?? null,
		string: string?.value ?? null,
		stringType: string?.type ?? null,
		option: option?.value ?? null,
		optionType: option?.type ?? null,
		pointer: pointer?.value ?? null,
		counter: counter?.value ?? null,
	};

	// children of the Vec and the String: are these elements, or raw struct fields?
	const vecChildren = await childNames(ctx, vec?.variablesReference);
	const stringChildren = await childNames(ctx, string?.variablesReference);
	const optionChildren = await childNames(ctx, option?.variablesReference);
	report.vecChildren = vecChildren.map((c) => ({ name: c.name, value: c.value }));
	report.stringChildren = stringChildren.map((c) => ({ name: c.name, value: c.value }));
	report.optionChildren = optionChildren.map((c) => ({ name: c.name, value: c.value }));
	if (vecChildren[0]?.variablesReference) {
		report.rawVecChildren = (await childNames(ctx, vecChildren[0].variablesReference)).map(
			(c) => ({
				name: c.name,
				value: c.value,
			}),
		);
	}

	const elementLike = (children: Array<{ name: string }>) =>
		children.filter((c) => /^\[?\d+\]?$/.test(c.name)).length;
	const vecElements = elementLike(vecChildren);
	const vecPretty = vecElements >= KNOWN_BYTES.length;
	const stringPretty =
		new RegExp(KNOWN_STRING).test(string?.value ?? "") ||
		stringChildren.some((c) => new RegExp(KNOWN_STRING).test(c.value));
	measure(
		"prettyPrint",
		vecPretty && stringPretty,
		`vecElements=${vecElements} vecChildren=${vecChildren.map((c) => c.name).join(",")} stringChildren=${stringChildren.map((c) => c.name).join(",")}`,
		false,
	);
	report.pretty = {
		vec: vecPretty,
		string: stringPretty,
		optionShowsSome:
			/\bSome\b/.test(option?.value ?? "") ||
			optionChildren.some((c) => /\bSome\b/.test(c.name)),
	};

	// Fallback check: LLDB's array-slice operator can still enumerate the buffer from the raw
	// pointer even without a formatter.
	if (pointer) {
		try {
			const evaluated = await client.send("evaluate", {
				expression: "*raw@8",
				frameId: Number(stop.frames[0]?.id ?? 0),
				context: "watch",
			});
			report.arraySlice = String(evaluated.result ?? "");
		} catch (error) {
			report.arraySlice = `error: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	return {
		scopes,
		localsRef,
		locals,
		vecChildren,
		stringChildren,
		optionChildren,
		pointer,
		counter,
	};
}
