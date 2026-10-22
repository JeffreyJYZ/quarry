import { useEffect, useRef, useState } from "react";
import { type Symbol as LspSymbol, lspSymbols } from "@/project/api";

export type BreadcrumbProps = {
	root: string;
	activePath: string | null;
	cursor: { line: number; character: number } | null;
	onNavigate: (path: string, line: number, character: number) => void;
};

function containsRange(symbol: LspSymbol, cursor: { line: number; character: number }): boolean {
	const r = symbol.range;
	if (cursor.line < r.start.line || cursor.line > r.end.line) return false;
	if (cursor.line === r.start.line && cursor.character < r.start.character) return false;
	if (cursor.line === r.end.line && cursor.character > r.end.character) return false;
	return true;
}

function rangeSize(symbol: LspSymbol): number {
	const r = symbol.range;
	return (r.end.line - r.start.line) * 1000000 + (r.end.character - r.start.character);
}

export default function Breadcrumb({ root, activePath, cursor, onNavigate }: BreadcrumbProps) {
	const [symbols, setSymbols] = useState<LspSymbol[]>([]);
	const cacheRef = useRef<Map<string, LspSymbol[]>>(new Map());
	const seqRef = useRef(0);

	useEffect(() => {
		if (activePath === null) {
			setSymbols([]);
			return;
		}
		const cached = cacheRef.current.get(activePath);
		if (cached !== undefined) {
			setSymbols(cached);
			return;
		}
		const seq = ++seqRef.current;
		void (async () => {
			try {
				const result = await lspSymbols(root, activePath);
				if (seqRef.current !== seq) return;
				cacheRef.current.set(activePath, result);
				setSymbols(result);
			} catch {
				if (seqRef.current !== seq) return;
				setSymbols([]);
			}
		})();
	}, [root, activePath]);

	if (activePath === null) {
		return null;
	}

	const relative = activePath.startsWith(`${root}/`)
		? activePath.slice(root.length + 1)
		: activePath;
	const segments = relative.split("/");

	let displaySegments = segments;
	if (segments.length > 4) {
		displaySegments = ["…", ...segments.slice(segments.length - 3)];
	}

	const chain: LspSymbol[] = [];
	if (cursor !== null) {
		const containing = symbols.filter((s) => containsRange(s, cursor));
		containing.sort((a, b) => rangeSize(b) - rangeSize(a));
		chain.push(...containing);
	}

	const items: { label: string; symbol: LspSymbol | null }[] = [
		...displaySegments.map((seg) => ({ label: seg, symbol: null })),
		...chain.map((sym) => ({ label: sym.name, symbol: sym })),
	];

	return (
		<nav className="breadcrumb" aria-label="breadcrumb">
			{items.map((item, i) => (
				<span
					key={`${item.label}-${item.symbol?.range.start.line ?? 0}-${item.symbol?.range.start.character ?? i}`}
					className="breadcrumb-item"
				>
					{i > 0 ? <span className="breadcrumb-sep">›</span> : null}
					{item.symbol === null ? (
						<span className="breadcrumb-path">{item.label}</span>
					) : (
						<button
							type="button"
							className="breadcrumb-symbol"
							onClick={() =>
								onNavigate(
									activePath,
									item.symbol?.range.start.line ?? 0,
									item.symbol?.range.start.character ?? 0,
								)
							}
						>
							{item.label}
						</button>
					)}
				</span>
			))}
		</nav>
	);
}
