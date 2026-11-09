# consts 09: git + problems

## problems

- `src/ui/problems/parts.ts:28,30,33`: `new Set([1, 2, 3, 4])` hardcoded severity threshold repeated 3x. Should reuse a const derived from `SEVERITY_LABEL` keys.
- `src/ui/problems/parts.ts:1` re-exports `SEVERITY_CLASS`/`SEVERITY_LABEL` from `src/lib/consts/problems.ts`; numbers live only in consts. Good.
- No other bare severity literals outside `parts.ts`.

## git

- Hash shortening length `0, 7` repeated in `src/ui/git/HistoryList.tsx:54`, `src/ui/git/rows.tsx:123`, `src/ui/git/BlameList.tsx:54` — extract `SHORT_HASH_LEN = 7`.
- History page limit literals `500`/`50` repeated in `src/ui/git/HistoryList.tsx:66,71` — `HISTORY_PAGE_SIZE = 50`, `HISTORY_LIMIT = 500`.
- Status letters/classes centralised in `src/lib/consts/git.ts`; union matches. Good.
- Diff colour classes `"added"`/`"removed"` as string literals `src/ui/git/DiffView.tsx:157-161` — minor; could be const map.

## junk

- Nothing worth moving beyond above.
