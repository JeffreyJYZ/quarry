import type { Range } from "@codemirror/state";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { InlayHint } from "@/project/api";

class InlayWidget extends WidgetType {
	constructor(private readonly text: string) {
		super();
	}
	eq(other: InlayWidget): boolean {
		return other.text === this.text;
	}
	toDOM(): HTMLElement {
		const span = document.createElement("span");
		span.className = "cm-inlay-hint";
		span.textContent = ` ${this.text}`;
		span.style.pointerEvents = "none";
		return span;
	}
	ignoreEvent(): boolean {
		return true;
	}
}

export const setInlayHints = StateEffect.define<InlayHint[] | null>();

export const inlayHintsField = StateField.define<ReturnType<typeof Decoration.set>>({
	create() {
		return Decoration.none;
	},
	update(value, tr) {
		for (const effect of tr.effects) {
			if (effect.is(setInlayHints)) {
				const hints = effect.value;
				if (hints === null) return Decoration.none;
				// merge hints at same position
				const byPos = new Map<number, string[]>();
				for (const hint of hints) {
					const line = tr.state.doc.line(
						Math.min(Math.max(hint.line + 1, 1), tr.state.doc.lines),
					);
					const char = Math.min(Math.max(hint.character, 0), line.length);
					const pos = line.from + char;
					const arr = byPos.get(pos);
					if (arr === undefined) byPos.set(pos, [hint.label]);
					else arr.push(hint.label);
				}
				const ranges: Range<Decoration>[] = [];
				for (const [pos, labels] of byPos) {
					ranges.push(
						Decoration.widget({
							widget: new InlayWidget(labels.join(", ")),
							side: 1,
						}).range(pos),
					);
				}
				ranges.sort((a, b) => a.from - b.from);
				return Decoration.set(ranges, true);
			}
		}
		if (tr.docChanged) {
			return value.map(tr.changes);
		}
		return value;
	},
	provide: (field) => EditorView.decorations.from(field),
});
