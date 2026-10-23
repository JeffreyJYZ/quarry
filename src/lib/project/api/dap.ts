import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
	BreakpointSpec,
	DataBreakpointInfo,
	DapBreakpoint,
	DapFrame,
	DapScope,
	DapSession,
	DapStoppedEvent,
	DapThread,
	DapVariable,
	DisassembledInstruction,
	ExceptionFilter,
	MemoryDump,
} from "@/lib/project/api/dap-types";
import type { LaunchConfig } from "@/lib/project/api/run";

export function dapLaunch(root: string, config: LaunchConfig): Promise<DapSession> {
	return invoke<DapSession>("dap_launch", { root, config });
}

export function dapAttach(pid: number): Promise<DapSession> {
	return invoke<DapSession>("dap_attach", { pid });
}

export function dapRestart(session: string): Promise<DapSession> {
	return invoke<DapSession>("dap_restart", { session });
}

export function dapConfigurationDone(session: string): Promise<void> {
	return invoke<void>("dap_configuration_done", { session });
}

export function dapSetBreakpoints(
	session: string,
	path: string,
	lines: number[],
): Promise<DapBreakpoint[]> {
	return invoke<DapBreakpoint[]>("dap_set_breakpoints", { session, path, lines });
}

export function dapSetBreakpointsEx(
	session: string,
	path: string,
	breakpoints: BreakpointSpec[],
): Promise<DapBreakpoint[]> {
	return invoke<DapBreakpoint[]>("dap_set_breakpoints_ex", { session, path, breakpoints });
}

export function dapContinue(session: string): Promise<void> {
	return invoke<void>("dap_continue", { session });
}

export function dapStep(session: string, kind: "next" | "stepIn" | "stepOut"): Promise<void> {
	return invoke<void>("dap_step", { session, kind });
}

export function dapThreads(session: string): Promise<DapThread[]> {
	return invoke<DapThread[]>("dap_threads", { session });
}

export function dapStackTrace(session: string, threadId: number): Promise<DapFrame[]> {
	return invoke<DapFrame[]>("dap_stack_trace", { session, threadId });
}

export function dapScopes(session: string, frameId: number): Promise<DapScope[]> {
	return invoke<DapScope[]>("dap_scopes", { session, frameId });
}

export function dapVariables(session: string, variablesReference: number): Promise<DapVariable[]> {
	return invoke<DapVariable[]>("dap_variables", { session, variablesReference });
}

export function dapSetVariable(
	session: string,
	variablesReference: number,
	name: string,
	value: string,
): Promise<void> {
	return invoke<void>("dap_set_variable", { session, variablesReference, name, value });
}

export function dapReadMemory(
	session: string,
	address: string,
	count: number,
): Promise<MemoryDump> {
	return invoke<MemoryDump>("dap_read_memory", { session, address, count });
}

export function dapWriteMemory(session: string, address: string, bytes: number[]): Promise<void> {
	return invoke<void>("dap_write_memory", { session, address, bytes });
}

export function dapDisassemble(
	session: string,
	address: string,
	count: number,
): Promise<DisassembledInstruction[]> {
	return invoke<DisassembledInstruction[]>("dap_disassemble", { session, address, count });
}

export function dapDataBreakpointInfo(
	session: string,
	variablesReference: number,
	name: string,
): Promise<DataBreakpointInfo> {
	return invoke<DataBreakpointInfo>("dap_data_breakpoint_info", {
		session,
		variablesReference,
		name,
	});
}

export function dapSetDataBreakpoints(
	session: string,
	dataIds: string[],
): Promise<DapBreakpoint[]> {
	return invoke<DapBreakpoint[]>("dap_set_data_breakpoints", { session, dataIds });
}

export function dapExceptionFilters(session: string): Promise<ExceptionFilter[]> {
	return invoke<ExceptionFilter[]>("dap_exception_filters", { session });
}

export function dapSetExceptionBreakpoints(session: string, filters: string[]): Promise<void> {
	return invoke<void>("dap_set_exception_breakpoints", { session, filters });
}

export function dapStop(session: string): Promise<void> {
	return invoke<void>("dap_stop", { session });
}

export function onDapStopped(handler: (event: DapStoppedEvent) => void): Promise<() => void> {
	return listen<DapStoppedEvent>("dap://stopped", (event) => handler(event.payload));
}

export function onDapTerminated(handler: (session: string) => void): Promise<() => void> {
	return listen<{ session: string }>("dap://terminated", (event) =>
		handler(event.payload.session),
	);
}

export type ProcessInfo = { pid: number; name: string };

export function listProcesses(): Promise<ProcessInfo[]> {
	return invoke<ProcessInfo[]>("list_processes");
}
