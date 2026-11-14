/**
 * Memory and disassembly, both addressed from the stopped frame.
 *
 * The pointer's value carries a string summary suffix, so the address is the leading `0x…` token; the
 * fallback is the first Vec child, which lldb names by address.
 */

import { KNOWN_BYTES } from "./constants";
import type { Context, Json, Session } from "./state";

export function hexdump(bytes: number[]): string {
	return bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

export async function readMemory(ctx: Context, session: Session): Promise<void> {
	const { report, fail } = ctx;
	const addressMatch = /^0x[0-9a-f]+/i.exec(session.pointer?.value.trim() ?? "");
	let address = addressMatch?.[0] ?? "";
	if (!address) {
		const childAddress = session.vecChildren[0]?.name;
		if (childAddress && /^0x[0-9a-f]+$/i.test(childAddress)) address = childAddress;
	}
	if (!address) {
		fail("readMemory", `no usable address (raw=${address || "absent"})`);
		return;
	}
	report.readMemoryAddress = address;
	const memory = await ctx.client.send("readMemory", {
		memoryReference: address,
		count: KNOWN_BYTES.length,
		offset: 0,
	});
	const bytes = Array.from(Buffer.from(String(memory.data ?? ""), "base64"));
	report.readMemoryBytes = bytes;
	report.readMemoryHex = hexdump(bytes);
	const matches =
		bytes.length === KNOWN_BYTES.length && bytes.every((b, i) => b === KNOWN_BYTES[i]);
	if (!matches) {
		fail("readMemory", `expected ${hexdump(KNOWN_BYTES)}, got ${hexdump(bytes)}`);
	}
}

export async function readDisassembly(ctx: Context, session: Session): Promise<void> {
	const { report, measure, fail } = ctx;
	const pc = String(session.frames[0]?.instructionPointerReference ?? "");
	report.instructionPointer = pc || null;
	if (!/^0x[0-9a-f]+$/i.test(pc)) {
		measure("disassemble", false, "frame had no instructionPointerReference", false);
		return;
	}
	const dis = await ctx.client.send("disassemble", {
		memoryReference: pc,
		offset: 0,
		instructionOffset: 0,
		instructionCount: 4,
		resolveSymbols: true,
	});
	const instructions = ((dis.instructions as Array<Json> | undefined) ?? []).map((i) => ({
		address: String(i.address),
		instruction: String(i.instruction),
		symbol: i.symbol ? String(i.symbol) : null,
	}));
	report.disassembly = instructions;
	if (instructions.length < 2) {
		fail("disassemble", `expected >=2 instructions, got ${instructions.length}`);
	}
}
