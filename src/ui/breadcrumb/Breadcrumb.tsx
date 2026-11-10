import { BREADCRUMB_TAIL, BREADCRUMB_VISIBLE } from "@/lib/consts/breadcrumb";
import { useEffect, useRef, useState } from "react";
import { type DocumentSymbol as LspSymbol, lspSymbols } from "@/lib/project/api";
import { symbolFailureNotice } from "@/lib/lsp/errors";
import { servedByRunningServer, sessionId } from "@/lib/lsp/served";
import { useRunningSessions } from "@/lib/lsp/useLspContext";

import { qualifiedName } from "@/lib/breadcrumb/model";
import { useBreadcrumbChain } from "@/lib/breadcrumb/useBreadcrumbChain";
import { relativeTo, segments } from "@/lib/project/paths";

export type BreadcrumbProps = {
	root: string;
	activePath: string | null;
	cursor: { line: number; character: number } | null;
	onNavigate: (path: string, line: number, character: number) => void;
};

export default function Breadcrumb({ root, activePath, cursor, onNavigate }: BreadcrumbProps) {
	const [symbols, setSymbols] = useState<LspSymbol[]>([]);
	const [symbolError, setSymbolError] = useState<string | null>(null);
	const [copyError, setCopyError] = useState<string | null>(null);
	const cacheRef = useRef<Map<string, LspSymbol[]>>(new Map());
	const seqRef = useRef(0);
	const running = useRunningSessions();

	const copyText = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopyError(null);
		} catch (err) {
			setCopyError(
				err instanceof Error ? err.message : "Copy failed: could not copy to clipboard.",
			);
		}
	};

	useEffect(() => {
		if (activePath === null) {
			setSymbols([]);
			setSymbolError(null);
			return;
		}
		const cached = cacheRef.current.get(activePath);
		if (cached !== undefined) {
			setSymbols(cached);
			setSymbolError(null);
			return;
		}
		const seq = ++seqRef.current;
		const kind = servedByRunningServer(activePath, running);
		if (kind === null) {
			// The restored tab can be active before its server answered. Quiet, not an error: the
			// running set is a dependency, so the chain arrives when that server starts.
			setSymbols([]);
			setSymbolError(null);
			return;
		}
		const sid = sessionId(kind, root);
		void (async () => {
			try {
				const result = await lspSymbols(sid, activePath);
				if (seqRef.current !== seq) return;
				cacheRef.current.set(activePath, result);
				setSymbols(result);
				setSymbolError(null);
			} catch (error) {
				if (seqRef.current !== seq) return;
				// A failed attempt is never cached, and a session a restart just tore down is not a
				// failure: both leave the breadcrumb quiet so the next running-set change retries.
				setSymbols([]);
				setSymbolError(symbolFailureNotice(error, "symbols unavailable: "));
			}
		})();
	}, [root, activePath, running]);

	const { chain } = useBreadcrumbChain(symbols, cursor);

	if (activePath === null) {
		return null;
	}

	const relative = relativeTo(root, activePath) ?? activePath;
	const pathSegments = segments(relative);

	let displaySegments = pathSegments;
	if (pathSegments.length > BREADCRUMB_VISIBLE) {
		displaySegments = ["…", ...pathSegments.slice(pathSegments.length - BREADCRUMB_TAIL)];
	}

	const chainNames = chain.map((s) => s.name);
	const wholeQualified = qualifiedName(chainNames);

	const items: { label: string; symbol: LspSymbol | null; qualified: string | null }[] = [
		...displaySegments.map((seg) => ({ label: seg, symbol: null, qualified: null })),
		...chain.map((sym, idx) => ({
			label: sym.name,
			symbol: sym,
			qualified: qualifiedName(chainNames.slice(0, idx + 1)),
		})),
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
						<>
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
							<button
								type="button"
								className="breadcrumb-copy"
								title={`Copy ${item.qualified}`}
								onClick={() => void copyText(item.qualified ?? item.label)}
							>
								{"\u2398"}
							</button>
						</>
					)}
				</span>
			))}
			{chain.length > 0 ? (
				<button
					type="button"
					className="breadcrumb-copy-all"
					title={`Copy ${wholeQualified}`}
					onClick={() => void copyText(wholeQualified)}
				>
					copy chain
				</button>
			) : null}
			{symbolError !== null ? <span className="breadcrumb-error">{symbolError}</span> : null}
			{copyError !== null ? <span className="breadcrumb-error">{copyError}</span> : null}
		</nav>
	);
}
