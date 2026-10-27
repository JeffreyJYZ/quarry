/** Shapes the debug adapter reports back. */

export type DapSession = { id: string; program: string };
export type DapThread = { id: number; name: string };
export type DapFrame = {
	id: number;
	name: string;
	source: string | null;
	line: number;
	column: number;
	instructionPointer: string | null;
};
export type DapScope = { name: string; variablesReference: number; expensive: boolean };
export type DapVariable = {
	name: string;
	value: string;
	typeName: string | null;
	variablesReference: number;
	memoryReference: string | null;
};
export type DapBreakpoint = {
	id: number | null;
	verified: boolean;
	line: number | null;
	message: string | null;
	source: string | null;
};
export type MemoryDump = { address: string; bytes: number[] };
export type DapEvaluation = {
	result: string;
	typeName: string | null;
	/** `0` for a scalar; otherwise the reference that expands the answer's children. */
	variablesReference: number;
};
export type DisassembledInstruction = {
	address: string;
	instruction: string;
	symbol: string | null;
};
export type DataBreakpointInfo = {
	dataId: string | null;
	description: string;
	accessTypes: string[];
};
export type DapStoppedEvent = {
	session: string;
	reason: string;
	description: string | null;
	threadId: number | null;
	line: number | null;
	source: string | null;
};
export type DapOutputEvent = {
	session: string;
	category: string;
	output: string;
};
export type BreakpointSpec = {
	line: number;
	condition?: string | null;
	hitCondition?: string | null;
	logMessage?: string | null;
	enabled?: boolean;
};
export type ExceptionFilter = { filter: string; label: string; default: boolean };
