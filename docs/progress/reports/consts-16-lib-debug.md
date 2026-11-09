# consts-16: src/lib/debug

## Repeats worth consolidating

- `"debug" | "release"` build-profile union written inline in `useSessionReset.ts`, `useTransport.ts`, `useDebugEvents.ts` instead of importing `BuildProfile` from `profile.ts` (defined once there). Same for `Setter<"debug" | "release" | null>`.
- `StepKind = "next" | "stepIn" | "stepOut"` duplicated between `sessionTypes.ts` and `dap.ts` (`dapStepOn`'s `kind` param).
- Thread id default `event.threadId ?? threads[0]?.id` / `stopRef.current?.threadId ?? undefined` pattern appears in `useStopSnapshot.ts`, `useTransport.ts`, `useBreakpointActions.ts`.

## Leave as-is

- DAP command names (`dap_launch`, `dap_step`, …) and event channels (`dap://stopped`, `dap://terminated`, `dap://output`) each appear once, in `src/lib/project/api/dap.ts` — single home.
- No timeouts in this tree.
- Breakpoint glyph `•` appears once (`VariablesTree.tsx`).
- `threads[0]?.id` fallback is single-site.
