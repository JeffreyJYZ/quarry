/**
 * Component tests get their DOM and their renderer from here.
 *
 * `@/test/dom` registers the DOM once per process and must be loaded before the testing library is
 * evaluated. Importing this module instead of the two separately keeps that order in one place, so
 * a test file cannot register the DOM a second time and break the ones beside it.
 */
import "@/test/dom";

export { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
export type { RenderResult } from "@testing-library/react";
