import { lazy } from "react";

/**
 * Overlays that load when first opened.
 *
 * A session may never open most of these, so keeping them in the first chunk charged every launch for
 * dialogs and panels it did not use. They live here so `AppOverlays` stays a render, not a manifest.
 */
export const DiffView = lazy(() => import("@/ui/git/DiffView"));
export const Goto = lazy(() => import("@/ui/goto/Goto"));
export const LinePrompt = lazy(() => import("@/ui/goto/LinePrompt"));
export const Generate = lazy(() => import("@/ui/generate/Generate"));
export const NewProject = lazy(() => import("@/ui/projects/NewProject"));
export const RefsPanel = lazy(() => import("@/ui/components/RefsPanel"));
export const SettingsPage = lazy(() => import("@/ui/settings/SettingsPage"));
export const Structure = lazy(() => import("@/ui/structure/StructurePalette"));
