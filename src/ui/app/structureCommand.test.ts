import { describe, expect, mock, test } from "bun:test";
import { structureCommand } from "@/ui/app/structureCommand";

describe("the File Structure palette row", () => {
	test("names its chord and says why it is unavailable without a file", () => {
		const row = structureCommand({ activePath: null, open: () => {} });
		expect(row.label).toBe("Go to symbol in file");
		expect(row.hint).toBe("Cmd+F12");
		expect(row.disabled).toBe(true);
		expect(row.disabledReason).toBe("Open a file first");
	});

	test("is enabled with a file open and opens the popup", () => {
		const open = mock(() => {});
		const row = structureCommand({ activePath: "/p/src/lib.rs", open });
		expect(row.disabled).toBe(false);
		row.run();
		expect(open).toHaveBeenCalledTimes(1);
	});
});
