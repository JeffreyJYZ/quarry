# Audit 23 (second pass) — end-to-end keyboard-only flows

Scope: read-only code walk of the three flows. No source edits, no builds.

## Flow 1 — open project and file, build, read a diagnostic

Keyboard path exists for most of it: `Cmd+O`/menu → `handleOpenProject` (`src/ui/app/useWorkspace.ts:80-88`) calls the native directory dialog; file tree rows are `<button>` (`src/ui/components/TreeRow.tsx:79-92`) and Enter activates; Quick Open (`openQuick`, `QuickOpenRow.tsx:33`) is keyboard-driven; build has a `build` command (`shellCommands.ts:52`) and problem rows are buttons (`src/ui/problems/ProblemRow.tsx:30-58`).

**P1 — Breakpoints cannot be toggled from the keyboard while debugging** (`src/ui/app/useClionKeymap.ts:86-101`)  
Why: `resolveDebugKey` returns `toggleBreakpoint` on F8, but during a live session the earlier `live && event.key === "F8"` step-over branch catches it first, so `Cmd+F8` steps over instead of toggling the caret line (`src/ui/app/useClionKeymap.ts:90-94` also runs on `activePath` + `cursor.line+1`). The only other route is mouse-clicking the gutter.  
Fix: guard the F8 step branch with `!event.metaKey` (or move the `toggleBreakpoint` branch above the step branches), as audit-18 P1 already calls for.

**P2 — Project switching is mouse-only from the sidebar** (`src/ui/components/Welcome.tsx:63-75`)  
The recent-project rows are buttons, so Enter works, but there is no command or keymap entry for “open recent by index”; switching projects requires focus + Enter on a visually discovered row, or mouse.  
Fix: add `open-recent` command taking a root, bound to palette/the rail.

## Flow 2 — start a debug session, set a breakpoint, step

Start (`Shift+F9`/`Ctrl+D`) and stepping (`F7`/`F8`) are keyboard-addressable.  
**P2 — Breakpoint on a line other than the caret** is mouse-only: only the gutter click sets per-line breakpoints (`src/ui/editor/useBreakpointGutter.ts` is invoked from gutter events; `toggleBreakpoint` takes `path,line`). Cmd+F8 exists but is caret-line only and dead during a session (see P1). The panel’s `BreakpointsSection` copy even says “Click the editor gutter to set one” (`src/ui/debug/BreakpointsSection.tsx:11`).  
Fix: fix Cmd+F8 ordering (P1), plus add a “toggle breakpoint on hovered/mouseless line” is impossible without focus tracking; document caret-based F8 as the keyboard path.

**P3 — Run-to-cursor requires a mouse:** `debug.runToCursor(path,line)` has no binding in the keymap (search shows no `run-to-cursor` key in `useClionKeymap.ts`); it is palace command only.  
Fix: bind `Alt+F9` (CLion) to `runToCursor(activePath, cursor.line+1)`.

## Flow 3 — settings open, change a value, close, focus restore

`Cmd+;` opens settings (`useClionKeymap.ts:167-171`), `Escape` closes (`SettingsPage.tsx:94-97`), and `openerRef` restores focus (`SettingsPage.tsx:53-66`). Controls are native inputs. **No dead end in this flow itself.** One weakening: `Project` tab disabled with no project (`SettingsPage.tsx:151`) is correct but its focus trap only Tab-cycles (`:99-118`), so skipped disabled tab is never focused (which is fine), but there is no ArrowLeft/Right between tabs.

## Cleared (works keyboard-only)

- `Cmd+;` / Escape for settings, with `openerRef` restore (`SettingsPage.tsx:58-67`).
- File tree rows as `<button>` with Enter (`TreeRow.tsx:79-92`).
- Quick Open rows (`QuickOpenRow.tsx:33`).
- Problem rows (`ProblemRow.tsx:30-58`) with Enter and Alt+Enter menu.
- Transport rail buttons (`TransportRail.tsx:129-187`) are real buttons, keyboard-activatable.
- Recent project rows (`Welcome.tsx:65-75`).
- Palette and native menu command rows all resolve (audit-24).
