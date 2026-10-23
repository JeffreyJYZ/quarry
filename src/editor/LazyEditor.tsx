import { forwardRef, lazy, Suspense } from "react";
import type { EditorHandle, EditorProps } from "@/editor/Editor";

const Inner = lazy(() => import("@/editor/Editor"));

export const LazyEditor = forwardRef<EditorHandle, EditorProps>((props, ref) => (
	<Suspense fallback={null}>
		<Inner ref={ref} {...props} />
	</Suspense>
));
LazyEditor.displayName = "LazyEditor";
export default LazyEditor;
