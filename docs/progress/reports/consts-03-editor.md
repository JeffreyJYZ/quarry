# consts-03-editor: magic numbers in src/ui/editor

Scope: `src/ui/editor/**`. Read-only scan. Notes only values that recur or already have a home in `src/lib/consts/*`.

## Already in consts, re-typed locally (cheapest wins)

- `editorMetrics.lineHeight "1.5"` (`src/lib/consts/editor.ts:39`) vs `Editor.tsx:44`/`useEditorRefs.ts:16-17` default tab size `4` and `Editor.tsx:45` font size `13` — default tab size `4` and font size `13` are not in consts; add `defaultTabSize`/`defaultFontSize` to `editorMetrics` (or a new `editorDefaults`). `editorTypes.ts:32-34` documents "4 when absent"/"13 when absent".
- `editorMetrics.gutterWidth "42px"` etc exist but `placePopup.ts` keeps its own `MARGIN = 8`, `GAP = 4`, `200` flip threshold (`placePopup.ts:6-7,12`) — candidate for a shared popup-placement const (none today).

## Debounce / timing literals

- `250` ms occurrence highlight debounce — `useOccurrenceHighlights.ts:89` (only occurrence site).
- `600` ms inlay hint debounce — `extensionsBehaviour.ts:59` (only inlay site).
- `150` ms signature help schedule — `useSignatureHelp.ts:83`.
- `10000` ms signature help auto-hide — `useSignatureHelp.ts:75`.
- `0` ms setTimeout for recompute — `extensionsBehaviour.ts:50` (trivial, leave).
  No const home exists; a `src/lib/consts/timing.ts` (or extend an existing) would centralise. None duplicated today, so low priority.

## Hardcoded defaults

- `tabSize = 4` — `Editor.tsx:44`, `useEditorRefs.ts:16-17` (fallback `?? 4`). Duplicated.
- `fontSize = 13` — `Editor.tsx:45`.
- `hintsVisible` initial `true` — `useInlayHints.ts:19` (single).

## Search / LSP limits

- `10000` match cap — `useEditorSearch.ts:67` (single).
- `Math.min(size.height, 200)` popup flip — `placePopup.ts:12` (single).

## Server-kind sets (repeated)

- `new Set<ServerKind>(["rust-analyzer", "clangd"])` — `useOccurrenceHighlights.ts:18`, `useInlayHints.ts:16`, `useSignatureHelp.ts:17`. Duplicated three times; candidate for a const in `src/lib/consts/lsp.ts` or `served.ts`. Check `served.ts` for an existing export before adding.

## Keymap literals

- `F7/F8/F9` step keys, `Mod-F8` toggle — `keymapDebug.ts:18-22,36`. Single file; leave unless a second consumer appears.
- `1` step count — `keymapLsp.ts:120` (`deps.stepRef.current(1)`). Single.

## Other

- `found.length > 10000` — search cap, single.
- `Math.max(doc.lines - 1, 0)` clamping — `useEditorEffects.ts:88`, `useOccurrenceHighlights.ts:66-69` (same pattern, different context). Not a value to centralise.

## Nothing worth moving

- `MARGIN = 8`, `GAP = 4` are already module-local and only used in `placePopup.ts`.
- Debounce values are each used once; centralising only pays off if a second consumer appears or a tuning pass is planned.
- No extension ids or language ids appear in `src/ui/editor`; extension handling lives in `lib/editor/languages.ts` and `lib/consts/extensions.ts`. Nothing to move here.
