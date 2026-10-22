import { useEffect, useRef, useState } from "react";
import { type Symbol as LspSymbol, lspSymbols } from "@/project/api";
import { describeError } from "@/project/errors";

const KIND_LABELS: Record<number, string> = {
	1: "file",
	2: "mod",
	3: "ns",
	4: "pkg",
	5: "class",
	6: "method",
	7: "prop",
	8: "field",
	9: "ctor",
	10: "enum",
	11: "interface",
	12: "fn",
	13: "var",
	14: "const",
	15: "str",
	16: "num",
	17: "bool",
	18: "arr",
	19: "obj",
	20: "key",
	21: "null",
	22: "enum",
	23: "struct",
	24: "event",
	25: "op",
	26: "type",
};

function kindLabel(kind: number): string {
	return KIND_LABELS[kind] ?? "sym";
}

const CAP = 400;

export type OutlineProps = {
	root: string;
	activePath: string | null;
	onNavigate: (path: string, line: number, character: number) => void;
};

export default function Outline({ root, activePath, onNavigate }: OutlineProps) {
	const [symbols, setSymbols] = useState<LspSymbol[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const seqRef = useRef(0);

	useEffect(() => {
		if (activePath === null) {
			setSymbols([]);
			setError(null);
			setLoading(false);
			return;
		}
		const seq = ++seqRef.current;
		setLoading(true);
		setError(null);
		const timer = window.setTimeout(() => {
			void (async () => {
				try {
					const result = await lspSymbols(root, activePath);
					if (seqRef.current !== seq) return;
					setSymbols(result);
					setLoading(false);
				} catch (err) {
					if (seqRef.current !== seq) return;
					setError(describeError(err));
					setSymbols([]);
					setLoading(false);
				}
			})();
		}, 300);
		return () => {
			window.clearTimeout(timer);
		};
	}, [root, activePath]);

	const shown = symbols.slice(0, CAP);
	const extra = symbols.length - shown.length;

	return (
		<div className="outline-scroll">
			<div className="rail-head">
				<span className="label">outline</span>
			</div>
			{activePath === null ? (
				<p className="empty">No file open.</p>
			) : loading && symbols.length === 0 ? (
				<p className="empty">loading…</p>
			) : error !== null ? (
				<p className="tree-note error">{error}</p>
			) : symbols.length === 0 ? (
				<p className="empty">No symbols.</p>
			) : (
				<ul className="outline-list">
					{shown.map((symbol) => (
						<li
							key={`${symbol.name}-${symbol.range.start.line}-${symbol.range.start.character}`}
						>
							<button
								type="button"
								className="outline-row"
								style={{ paddingLeft: `${8 + symbol.depth * 12}px` }}
								onClick={() =>
									onNavigate(
										activePath,
										symbol.range.start.line,
										symbol.range.start.character,
									)
								}
							>
								<span className="outline-name">{symbol.name}</span>
								<span className="outline-kind">{kindLabel(symbol.kind)}</span>
							</button>
						</li>
					))}
					{extra > 0 ? (
						<li>
							<p className="outline-more">+{extra} more</p>
						</li>
					) : null}
				</ul>
			)}
		</div>
	);
}
