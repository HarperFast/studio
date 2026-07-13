/**
 * Render a {@link SchemaDocument} back to `schema.graphql` text.
 *
 * Fidelity rules (see ./types.ts):
 * - `raw` segments and un-`edited` tables are emitted byte-for-byte, so opening
 *   the visual editor and touching one table never reformats the others.
 * - `edited` / newly-added tables are generated canonically: directives and
 *   their arguments in a fixed order (unknown ones preserved, appended in
 *   original order), using the document's detected indent and newline.
 * - Tables are sorted alphabetically among their original positions; each
 *   table's attached leading comments travel with it. Non-table `raw` segments
 *   stay anchored where they were.
 */
import { Directive, formatTypeRef, SchemaDocument, Segment, TableModel } from './types';

const TABLE_DIRECTIVE_ORDER = ['table', 'export', 'sealed'];
const FIELD_DIRECTIVE_ORDER = [
	'primaryKey',
	'indexed',
	'computed',
	'relationship',
	'createdTime',
	'updatedTime',
	'expiresAt',
	'enumerable',
	'allow',
];
const ARG_ORDER: Record<string, string[]> = {
	table: ['table', 'database', 'expiration', 'audit', 'eviction', 'scanInterval', 'replicate', 'randomAccessFields'],
	export: ['name', 'rest', 'mqtt'],
	indexed: ['type', 'distance', 'efConstruction', 'M', 'optimizeRouting', 'mL', 'efConstructionSearch'],
	computed: ['from', 'version'],
	relationship: ['from', 'to'],
	allow: ['role'],
};

/** Stable sort `items` by their rank in `order` (unknown keys keep original order, after known ones). */
function orderByRank<T>(items: T[], keyOf: (item: T) => string, order: string[]): T[] {
	const rank = (name: string) => {
		const index = order.indexOf(name);
		return index < 0 ? order.length : index;
	};
	return items
		.map((item, index) => ({ item, index }))
		.sort((a, b) => rank(keyOf(a.item)) - rank(keyOf(b.item)) || a.index - b.index)
		.map(entry => entry.item);
}

function serializeDirective(directive: Directive): string {
	if (directive.args.length === 0) {
		return `@${directive.name}`;
	}
	const args = orderByRank(directive.args, arg => arg.name, ARG_ORDER[directive.name] ?? []);
	return `@${directive.name}(${args.map(arg => `${arg.name}: ${arg.value}`).join(', ')})`;
}

function serializeDirectives(directives: Directive[], order: string[]): string {
	return orderByRank(directives, directive => directive.name, order)
		.map(serializeDirective)
		.join(' ');
}

/** Append a stored comment/description block to `lines`, re-indented to the canonical indent. */
function appendCommentLines(lines: string[], comment: string, indent: string): void {
	for (const rawLine of comment.split('\n')) {
		// Strip any indentation the line already carried (e.g. interior lines of a
		// multi-line """description""") before applying the canonical indent, so
		// re-editing a table doesn't compound the indentation each time. Blank
		// lines stay blank.
		const line = rawLine.replace(/\r$/, '').replace(/^[ \t]+/, '');
		lines.push(line ? `${indent}${line}` : '');
	}
}

/** Generate the canonical `type … { … }` text for an edited or new table. */
function generateTable(table: TableModel, doc: SchemaDocument): string {
	const { indent, newline } = doc;
	const directives = serializeDirectives(table.directives, TABLE_DIRECTIVE_ORDER);
	const header = `type ${table.typeName}${directives ? ` ${directives}` : ''} {`;
	const lines: string[] = [table.headerComment ? `${header} ${table.headerComment}` : header];

	for (const field of table.fields) {
		// An added-but-unnamed field would emit invalid SDL (`\t: String`); skip it
		// until the user names it, mirroring how unnamed tables are handled.
		if (!field.name.trim()) {
			continue;
		}
		for (const comment of field.leadingComments) {
			appendCommentLines(lines, comment, indent);
		}
		const fieldDirectives = serializeDirectives(field.directives, FIELD_DIRECTIVE_ORDER);
		const suffix = [fieldDirectives, field.lineComment].filter(Boolean).join(' ');
		lines.push(`${indent}${field.name}: ${formatTypeRef(field.type)}${suffix ? ` ${suffix}` : ''}`);
	}

	// Comments that trailed the last field, before `}` — preserved so an edit
	// doesn't silently drop them.
	for (const comment of table.trailingComments) {
		appendCommentLines(lines, comment, indent);
	}

	return `${lines.join(newline)}${newline}}`;
}

function serializeSegment(segment: Segment, doc: SchemaDocument): string {
	if (segment.kind === 'raw') {
		return segment.text;
	}
	const { table } = segment;
	return table.edited ? table.leading + generateTable(table, doc) : table.leading + table.raw;
}

export function serializeSchema(doc: SchemaDocument): string {
	// A freshly-added table has no name yet; writing `type  @table { … }` would be
	// invalid and can't round-trip. Drop any blank-named table — along with the
	// whitespace-only separators addTable placed around it — so an in-progress
	// table contributes nothing to the file until the user names it.
	const dropped = new Set<number>();
	doc.segments.forEach((segment, index) => {
		if (segment.kind === 'table' && segment.table.typeName.trim() === '') {
			dropped.add(index);
			const previous = doc.segments[index - 1];
			if (previous?.kind === 'raw' && previous.text.trim() === '') {
				dropped.add(index - 1);
			}
			const next = doc.segments[index + 1];
			if (next?.kind === 'raw' && next.text.trim() === '') {
				dropped.add(index + 1);
			}
		}
	});
	const segments = doc.segments.filter((_, index) => !dropped.has(index));

	// Order tables alphabetically only once the user has actually edited something.
	// Sorting on open would reorder verbatim blocks and mark an unsorted file dirty
	// the moment it's viewed; deferring until an edit keeps "just looking" a no-op
	// while still normalizing order in generated output.
	const hasEdits = segments.some(segment => segment.kind === 'table' && segment.table.edited);
	if (hasEdits) {
		const tableSlots: number[] = [];
		segments.forEach((segment, index) => {
			if (segment.kind === 'table') {
				tableSlots.push(index);
			}
		});
		const sortedTables = tableSlots
			.map(slot => (segments[slot] as { kind: 'table'; table: TableModel }).table)
			.sort((a, b) => a.typeName.localeCompare(b.typeName));
		tableSlots.forEach((slot, order) => {
			segments[slot] = { kind: 'table', table: sortedTables[order] };
		});
	}

	return segments.map(segment => serializeSegment(segment, doc)).join('');
}
