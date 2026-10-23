/**
 * The backend's whole command surface, one module per area.
 *
 * Callers import from this index (`@/lib/project/api`) so the file layout can change without
 * touching every call site.
 */
export * from "./backend";
export * from "./dap";
export * from "./dap-types";
export * from "./git";
export * from "./lsp";
export * from "./lsp-types";
export * from "./run";
export * from "./run-configuration";
export * from "./search";
export * from "./settings";
export * from "./terminal";
