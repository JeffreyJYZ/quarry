import { KIND_LABELS } from "@/lib/consts/outline";

export { KIND_LABELS } from "@/lib/consts/outline";

export function kindLabel(kind: number): string {
	return KIND_LABELS[kind] ?? "sym";
}
