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
