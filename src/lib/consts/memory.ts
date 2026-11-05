/** Hex and disassembly geometry: row widths, page sizes and the read chunk the adapter accepts. */

/** Bytes rendered per row when no width has been chosen. */
export const ROW_BYTES = 16;

/** Row widths the hex pane offers, in bytes. */
export const ROW_WIDTHS = [8, 16, 32];

/** Hex digits the offset column is padded to. */
export const OFFSET_DIGITS = 4;

/** Largest count one `readMemory` call may ask for. */
export const CHUNK_BYTES = 256;

/** Instruction counts the disassembly pane offers. */
export const DISASM_COUNTS = [16, 64, 128];

/** Page sizes the hex pane offers, in bytes. */
export const PAGE_SIZES = [64, 256, 1024];

/** The page size a first read uses before the pane remembers a choice. */
export const DEFAULT_PAGE = 256;
