import { useEffect, useRef, useState } from "react";
import type { StructureSource } from "@/lib/outline/structure";
import { lspErrorMessage } from "@/lib/lsp/paths";
import type { DocumentSymbol as LspSymbol } from "@/lib/project/api";
import { lspSymbols } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

/** How the popup reaches a file's symbols; a test replaces it with its own source. */
export type StructureLoad = (session: string, path: string) => Promise<LspSymbol[]>;

export const loadStructureSymbols: StructureLoad = (session, path) => lspSymbols(session, path);

export type StructureSymbols = {
	symbols: LspSymbol[];
	loading: boolean;
	error: string | null;
};

const NONE: LspSymbol[] = [];

/**
 * The symbols of one file, dropped the moment the popup looks at another.
 *
 * A server answer carries no file of its own, so the sequence number is the only proof it belongs to
 * the file on screen; without it a slow reply for the previous tab overwrites the new list.
 */
export function useStructureSymbols(
	source: StructureSource,
	session: string | null,
	path: string | null,
	load: StructureLoad,
): StructureSymbols {
	const [symbols, setSymbols] = useState<LspSymbol[]>(NONE);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const seqRef = useRef(0);

	useEffect(() => {
		const seq = ++seqRef.current;
		setSymbols(NONE);
		setError(null);
		if (source !== "ready" || session === null || path === null) {
			setLoading(false);
			return;
		}
		setLoading(true);
		void load(session, path).then(
			(result) => {
				if (seqRef.current !== seq) return;
				setSymbols(result);
				setLoading(false);
			},
			(failure: unknown) => {
				if (seqRef.current !== seq) return;
				setError(lspErrorMessage(describeError(failure)));
				setLoading(false);
			},
		);
	}, [source, session, path, load]);

	return { symbols, loading, error };
}
