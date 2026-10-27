import { dapEvaluate } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { addressFromValue } from "@/lib/debug/memory/expression";
import { parseAddress } from "@/lib/debug/memory/hex";

/** Either the address to read, or the sentence to show under the bar. */
export type Resolved = { address: bigint; error: null } | { address: null; error: string };

/**
 * What the user typed, as an address: literal hex, or any expression the debugger can evaluate.
 *
 * `&count`, `head->next` and `&items[2]` all come back from lldb as a hex address, which is the one
 * thing `readMemory` and `disassemble` can use. A scalar (`count` → `2`) is reported with what it
 * actually was, because "not an address" alone leaves you guessing whether the name was wrong.
 */
export async function resolveAddress(
	text: string,
	options: { session: string | null; frameId: number | null },
): Promise<Resolved> {
	const trimmed = text.trim();
	if (trimmed === "") {
		return { address: null, error: "Enter an address, a variable or an expression" };
	}
	const literal = parseAddress(trimmed);
	if (literal !== null) {
		return { address: literal, error: null };
	}
	if (options.session === null) {
		return {
			address: null,
			error: `"${trimmed}" is not an address, and no session is running to evaluate it`,
		};
	}
	try {
		const answer = await dapEvaluate(options.session, trimmed, options.frameId);
		const address = addressFromValue(answer.result);
		if (address === null) {
			return {
				address: null,
				error: `${trimmed} is ${answer.result}, which is not an address — try &${trimmed}`,
			};
		}
		return { address, error: null };
	} catch (failure) {
		return { address: null, error: describeError(failure) };
	}
}
