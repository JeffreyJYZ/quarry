/**
 * Editor state kept alive across view remounts, so a tab switch is a move and not a reset.
 *
 * A document is addressed by `documentId` (`path#loadId`), so the cache can never hand a reloaded
 * file the undo history of the text it replaced: the load id changes and the lookup misses. What the
 * cache holds is opaque here — CodeMirror's `toJSON` output and the viewport it was left at — which
 * keeps the eviction and hit rules testable without a DOM.
 */

/** A saved `EditorState` and the viewport it was left at. */
export type CachedDocument = {
	/** The file it belongs to, so a stale load id can be dropped without parsing the key. */
	path: string;
	/** The text the state describes. A restore is valid only for the same text. */
	doc: string;
	/** `EditorState.toJSON()`, kept opaque so this module needs no CodeMirror import. */
	state: unknown;
	scrollTop: number;
	scrollLeft: number;
};

/** Documents kept between remounts. Past this the least recently used is evicted. */
export const DOCUMENT_CACHE_LIMIT = 20;

export type DocumentCache = Map<string, CachedDocument>;

/** The cache the editor surface writes through; module-scoped because the view outlives nothing. */
export const documentCache: DocumentCache = new Map();

/**
 * Remember a document and make it the most recently used.
 *
 * Any other id for the same path is dropped: a reload bumps the load id, so the previous entry can
 * never be looked up again and would only occupy a slot.
 */
export function saveDocument(
	cache: DocumentCache,
	id: string,
	document: CachedDocument,
	limit = DOCUMENT_CACHE_LIMIT,
): void {
	for (const [key, entry] of cache) {
		if (key !== id && entry.path === document.path) cache.delete(key);
	}
	cache.delete(id);
	cache.set(id, document);
	while (cache.size > limit) {
		const oldest = cache.keys().next();
		if (oldest.done === true) break;
		cache.delete(oldest.value);
	}
}

/**
 * The state to mount `doc` with, or `null` when there is nothing to restore.
 *
 * A hit moves to the recent end so eviction takes the document left alone longest. A state saved for
 * different text is dropped rather than returned: its history describes changes that do not map onto
 * this document, and replaying them would corrupt the file.
 */
export function restoreDocument(
	cache: DocumentCache,
	id: string,
	doc: string,
): CachedDocument | null {
	const saved = cache.get(id);
	if (saved === undefined) return null;
	cache.delete(id);
	if (saved.doc !== doc) return null;
	cache.set(id, saved);
	return saved;
}

/** Forget one document, for a tab that will not come back. */
export function dropDocument(cache: DocumentCache, id: string): void {
	cache.delete(id);
}

/** Forget every cached load of one path, e.g. when its project is replaced. */
export function dropPathDocuments(cache: DocumentCache, path: string): void {
	for (const [key, entry] of cache) if (entry.path === path) cache.delete(key);
}
