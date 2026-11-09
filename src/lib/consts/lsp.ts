/** Labels and order for the type-hierarchy pane's two directions. */

import type { ServerKind } from "@/lib/lsp/served";
import type { TypeHierarchyDirection } from "@/lib/lsp/typeHierarchy";
export const DIRECTIONS: TypeHierarchyDirection[] = ["supertypes", "subtypes"];

export const TITLES: Record<TypeHierarchyDirection, string> = {
	supertypes: "Supertypes",
	subtypes: "Subtypes",
};

export const EMPTY_NOTES: Record<TypeHierarchyDirection, string> = {
	supertypes: "No supertypes",
	subtypes: "No subtypes",
};

/** Every server kind this build knows how to run. */
export const RUST_ANALYZER: ServerKind = "rust-analyzer";
export const CLANGD: ServerKind = "clangd";
export const ALL_SERVER_KINDS: readonly ServerKind[] = [RUST_ANALYZER, CLANGD];

/** Separator between server kind and root in a composed session id (`{kind}::{root}`). */
export const SESSION_SEPARATOR = "::";

/** Indentation of a type-hierarchy row: the base offset and the step per depth. */
export const HIERARCHY_BASE_INDENT = 6;
export const HIERARCHY_INDENT_STEP = 14;
