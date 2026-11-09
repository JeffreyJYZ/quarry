/**
 * Component tests get their DOM and their renderer from here.
 *
 * `@/test/dom` registers the DOM once per process and must be loaded before the testing library is
 * evaluated. Importing this module instead of the two separately keeps that order in one place, so
 * a test file cannot register the DOM a second time and break the ones beside it.
 */
import "@/test/dom";
import { afterEach } from "bun:test";
import { Window } from "happy-dom";
import { type ReactElement, act } from "react";
import { createRoot } from "react-dom/client";

export { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
export type { RenderResult } from "@testing-library/react";

/** A window of its own, so a re-render test never borrows a neighbour's DOM. */
const host = new Window();
const mounted: (() => void)[] = [];

/** Mount once, then re-render the same tree so a memo is exercised across renders. */
export function mount(element: ReactElement): (next: ReactElement) => void {
	const container = host.document.createElement("div") as unknown as Element;
	const root = createRoot(container);
	act(() => root.render(element));
	mounted.push(() => act(() => root.unmount()));
	return (next: ReactElement) => act(() => root.render(next));
}

afterEach(() => {
	for (const unmount of mounted.splice(0)) unmount();
});
