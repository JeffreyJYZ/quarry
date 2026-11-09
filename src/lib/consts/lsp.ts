/** Labels and order for the type-hierarchy pane's two directions. */

import type { TypeHierarchyDirection } from "@/lib/lsp/typeHierarchy";
import type { ServerKind } from "@/lib/lsp/served";
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
export const ALL_SERVER_KINDS: readonly ServerKind[] = ["rust-analyzer", "clangd"];

/** Separator between server kind and root in a composed session id (`{kind}::{root}`). */
export const SESSION_SEPARATOR = "::";
