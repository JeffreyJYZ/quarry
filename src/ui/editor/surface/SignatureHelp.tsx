import { splitTopLevel } from "@/lib/editor/completion";
import type { SignatureHelp as Help } from "@/lib/project/api";

/** The signature popup, with the parameter the caret sits in highlighted. */
export default function SignatureHelp({
	help,
	coords,
}: {
	help: Help;
	coords: { top: number; left: number };
}) {
	const activeSignature = help.activeSignature ?? 0;
	const signature = help.signatures[activeSignature] ?? help.signatures[0];
	const label = signature.label;
	const activeParam = help.activeParameter ?? 0;
	const parts = splitTopLevel(label);
	const doc = (signature.documentation ?? "").slice(0, 200);
	return (
		<div className="cm-sig-help" style={{ top: coords.top + 4, left: coords.left }}>
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
