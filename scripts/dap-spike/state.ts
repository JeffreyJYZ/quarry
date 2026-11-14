/**
 * The shapes the steps pass between each other: the generated project, one measurement, the
 * variables the stopped frame exposes, and the context every step is handed.
 */

import type { DapClient } from "./client";

export type Json = Record<string, unknown>;

export interface DapEvent {
	event: string;
	body?: Json;
}

export interface Scratch {
	dir: string;
	binary: string;
	source: string;
	breakpointLine: number;
}

export interface Measure {
	name: string;
	required: boolean;
	ok: boolean;
	detail: string;
}

/** One local as the adapter reports it. */
export interface Local {
	name: string;
	value: string;
	type: string;
	variablesReference: number;
}

/** A child of a local, as the adapter reports it. */
export interface Child {
	name: string;
	value: string;
	variablesReference: number;
}

/** Everything a step needs from the run. */
export interface Context {
	client: DapClient;
	scratch: Scratch;
	report: Record<string, unknown>;
	measure: (name: string, ok: boolean, detail: string, required?: boolean) => boolean;
	fail: (name: string, detail: string) => void;
}

/** What one stopped session exposes. */
export interface Session {
	capabilities: Record<string, boolean>;
	frames: Json[];
	threadId: number;
	scopes: Json[];
	localsRef: number;
	locals: Local[];
	vecChildren: Child[];
	stringChildren: Child[];
	optionChildren: Child[];
	pointer?: Local;
	counter?: Local;
}
