/**
 * Reducer holding the visual editor's working {@link SchemaDocument}. The buffer
 * (session-stored file content) is the source of truth; this doc is an editable
 * projection of it. Every mutation marks its table `edited`, which flips it from
 * verbatim to canonical generation on serialize.
 */
import { createTable } from '@/features/instance/applications/lib/schema/mutations';
import { parseSchema } from '@/features/instance/applications/lib/schema/parseSchema';
import { serializeSchema } from '@/features/instance/applications/lib/schema/serializeSchema';
import { SchemaDocument, Segment, TableModel } from '@/features/instance/applications/lib/schema/types';

let tableIdSeed = 0;

export type SchemaEditorAction =
	/** Re-derive the doc from buffer text (mount, revert, return from the text editor). */
	| { type: 'reset'; source: string }
	/** Append a blank table for the user to fill in. */
	| { type: 'addTable' }
	| { type: 'removeTable'; id: string }
	/** Replace a table wholesale with an edited copy built by the GUI. */
	| { type: 'updateTable'; id: string; table: TableModel };

export function parseDocument(source: string): SchemaDocument {
	return parseSchema(source).document;
}

function addTable(state: SchemaDocument): SchemaDocument {
	const table = createTable(`new-${tableIdSeed++}`);
	// Separate the new table from existing content with a blank line (matching the
	// old New-Table modal), or nothing when the file is empty.
	const current = serializeSchema(state);
	const separator = current.length === 0
		? ''
		: current.endsWith('\n')
		? state.newline
		: state.newline + state.newline;
	const additions: Segment[] = [
		{ kind: 'raw', text: separator },
		{ kind: 'table', table },
		{ kind: 'raw', text: state.newline },
	];
	return { ...state, segments: [...state.segments, ...additions] };
}

export function schemaEditorReducer(state: SchemaDocument, action: SchemaEditorAction): SchemaDocument {
	switch (action.type) {
		case 'reset':
			return parseDocument(action.source);
		case 'addTable':
			return addTable(state);
		case 'removeTable':
			return {
				...state,
				segments: state.segments.filter(segment => !(segment.kind === 'table' && segment.table.id === action.id)),
			};
		case 'updateTable':
			return {
				...state,
				segments: state.segments.map(segment =>
					segment.kind === 'table' && segment.table.id === action.id
						? { kind: 'table', table: { ...action.table, edited: true } }
						: segment
				),
			};
	}
}

/** The editable tables in document order (the GUI renders them top-to-bottom). */
export function documentTables(doc: SchemaDocument): TableModel[] {
	return doc.segments.flatMap(segment => (segment.kind === 'table' ? [segment.table] : []));
}

/**
 * True when the file holds content the visual editor doesn't model (scalars,
 * enums, non-`@table` types) — anything in a raw segment that isn't just
 * whitespace or comments. Drives a "preserved, edit as text to see it" hint.
 */
export function hasUnmodeledContent(doc: SchemaDocument): boolean {
	return doc.segments.some(segment => {
		if (segment.kind !== 'raw') {
			return false;
		}
		const withoutComments = segment.text.replace(/#[^\n]*/g, '');
		return withoutComments.trim().length > 0;
	});
}
