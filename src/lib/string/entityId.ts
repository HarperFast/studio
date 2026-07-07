// Harper resources are addressed by IDs that carry a distinct, lowercase prefix
// per resource type (e.g. `org-qpz5akmyrp1d0opj`, `clu-tc9pqw20vrks2zik`,
// `ins-…`). The lowercase casing is what lets us tell a pasted ID apart from a
// human-typed title — a title like "Org Chart" or "Cluster West" never matches.

export type EntityIdKind = 'organization' | 'cluster' | 'instance';

const PREFIX_TO_KIND: Record<string, EntityIdKind> = {
	org: 'organization',
	clu: 'cluster',
	ins: 'instance',
};

// Lowercase prefix + lowercase alphanumeric body, anchored end-to-end so
// partial/looser matches (mixed case, spaces, trailing junk) fall through to
// the normal name search instead of being treated as an ID.
const ENTITY_ID_PATTERN = /^(org|clu|ins)-[a-z0-9]+$/;

/**
 * Detects whether a string is a Harper resource ID and, if so, which kind of
 * resource it identifies. Returns `null` for anything that only looks like a
 * title (so callers can fall back to a name search).
 */
export function detectEntityId(value: string | undefined | null): { kind: EntityIdKind; id: string } | null {
	if (typeof value !== 'string') {
		return null;
	}
	const id = value.trim();
	const match = ENTITY_ID_PATTERN.exec(id);
	if (!match) {
		return null;
	}
	return { kind: PREFIX_TO_KIND[match[1]], id };
}
