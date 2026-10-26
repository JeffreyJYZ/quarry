import { useLayoutEffect, useRef, useState } from "react";
import { splitTopLevel } from "@/lib/editor/completion";
import type { SignatureHelp as Help } from "@/lib/project/api";
import { placePopup } from "./placePopup";

/** Where the caret is, in viewport coordinates, so the popup can flip near an edge. */
export type SignatureAnchor = { left: number; top: number; bottom: number };

type Placement = ReturnType<typeof placePopup>;

/**
 * The signature popup, with the parameter the caret sits in highlighted.
 *
 * It measures itself after mount: a popup with room below sits under the caret, one without flips
 * above it, and a popup that would leave the window slides back in. Height is capped in CSS, so a
 * long documentation block scrolls inside the popup instead of running off the screen.
 */
export default function SignatureHelp({ help, anchor }: { help: Help; anchor: SignatureAnchor }) {
	const ref = useRef<HTMLDivElement | null>(null);
	const [placement, setPlacement] = useState<Placement>({
		top: anchor.bottom + 4,
		left: anchor.left,
	});

	useLayoutEffect(() => {
		const node = ref.current;
		if (node === null) return;
		const box = node.getBoundingClientRect();
		setPlacement(
			placePopup(
				{ left: anchor.left, top: anchor.top, bottom: anchor.bottom },
				{ width: box.width, height: box.height },
				{ width: window.innerWidth, height: window.innerHeight },
			),
		);
	}, [anchor]);

	const activeSignature = help.activeSignature ?? 0;
	const signature = help.signatures[activeSignature] ?? help.signatures[0];
	const label = signature.label;
	const activeParam = help.activeParameter ?? 0;
	const parts = splitTopLevel(label);
	const doc = signature.documentation ?? "";

	return (
		<div className="cm-sig-help" ref={ref} style={placement}>
			<div className="cm-sig-label">
				{parts.length > 1 && activeParam >= 0 && activeParam < parts.length
					? parts.map((part, index) => (
							<span key={part}>
								{index > 0 ? ", " : ""}
								{index === activeParam ? (
									<span className="cm-sig-active">{part}</span>
								) : (
									part
								)}
							</span>
						))
					: label}
			</div>
			{doc ? <div className="cm-sig-doc">{doc}</div> : null}
		</div>
	);
}
