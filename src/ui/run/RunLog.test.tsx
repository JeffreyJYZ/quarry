import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@/test/render";
import RunLog from "@/ui/run/RunLog";

function log(options: { running: boolean; onStdin?: (text: string) => void }) {
	return render(
		<RunLog
			lines={[]}
			exited={null}
			onClear={() => {}}
			argv="/bin/cat"
			running={options.running}
			stopping={false}
			onStop={() => {}}
			onRerun={() => {}}
			onStdin={options.onStdin ?? (() => {})}
		/>,
	);
}

type InputProps = { onChange?: (event: { target: { value: string } }) => void };

/**
 * Type into the row.
 *
 * React 19's change plugin never delivers an input or change event under happy-dom: the value lands
 * in the DOM and the component's own handler never runs, on a plain input as much as on this one.
 * The handler the browser would call is therefore called directly, so the row's state and its
 * submit are still exercised end to end.
 */
function type(input: HTMLInputElement, value: string) {
	const key = Object.getOwnPropertyNames(input).find((name) => name.startsWith("__reactProps$"));
	const props = (input as unknown as Record<string, InputProps | undefined>)[key ?? ""];
	act(() => props?.onChange?.({ target: { value } }));
}

afterEach(() => {
	cleanup();
});

describe("the run console's input row", () => {
	test("is disabled when no program is running", () => {
		const view = log({ running: false });

		const input = view.getByLabelText("Program input") as HTMLInputElement;

		expect(input.disabled).toBe(true);
	});

	test("sends what was typed when the row is submitted and clears it", () => {
		const onStdin = mock((_text: string) => {});
		const view = log({ running: true, onStdin });
		const input = view.getByLabelText("Program input") as HTMLInputElement;
		const form = view.container.querySelector("form");
		if (form === null) throw new Error("the input row is not a form");

		type(input, "hello");
		expect(input.value).toBe("hello");
		// Enter in a single-input form is the browser's own submit, which is what the row relies on.
		fireEvent.submit(form);

		expect(onStdin).toHaveBeenCalledTimes(1);
		expect(onStdin).toHaveBeenCalledWith("hello");
		expect(input.value).toBe("");
	});

	test("sends nothing while the program is not running", () => {
		const onStdin = mock((_text: string) => {});
		const view = log({ running: false, onStdin });
		const form = view.container.querySelector("form");
		if (form === null) throw new Error("the input row is not a form");

		fireEvent.submit(form);

		expect(onStdin).not.toHaveBeenCalled();
	});
});
