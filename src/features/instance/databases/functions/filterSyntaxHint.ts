import { InstanceAttribute } from '@/integrations/api/api.patch';

export type FilterKind = 'text' | 'number' | 'date' | 'boolean';

// What `parseComparator` reads, by the kind of value the column holds.
export const FILTER_SYNTAX: Readonly<Record<FilterKind, readonly string[]>> = {
	text: [
		'Jo* starts with',
		'*hn ends with',
		'*oh* contains',
		'== Jo* exactly, star and all',
		'!= Jo not equal',
		'a & b both',
	],
	number: ['5 equals', '>5  >=5  <5  <=5', '!= 5 not equal', '>1 & <9 both'],
	date: ['2026-01-31 equals', '>2026-01-01  <=2026-12-31', '>2026-01-01 & <2026-02-01 both'],
	boolean: ['true or false', '!= true not equal'],
};

const NUMERIC_TYPES: ReadonlySet<string> = new Set(['Int', 'Long', 'Float', 'BigInt']);

export function filterKind(type: InstanceAttribute['type']): FilterKind {
	if (NUMERIC_TYPES.has(type ?? '')) {
		return 'number';
	}
	return type === 'Date' ? 'date' : type === 'Boolean' ? 'boolean' : 'text';
}

const UNINDEXED_NOTE = 'Not indexed: a filter on this alone reads every record, so you are asked first.';
const SCAN_NOTE: Readonly<Record<FilterKind, string>> = {
	text: 'Ends with, contains and != read every record unless another filter uses an index.',
	number: '!= reads every record unless another filter uses an index.',
	date: '!= reads every record unless another filter uses an index.',
	boolean: '!= reads every record unless another filter uses an index.',
};

// Built on every render of the grid's columns, so the eight possible strings are made once.
const hints = new Map<string, string>();

export function filterSyntaxHint(type: InstanceAttribute['type'], unindexed: boolean): string {
	const kind = filterKind(type);
	const key = `${kind}:${unindexed}`;
	let hint = hints.get(key);
	if (hint === undefined) {
		hint = [...FILTER_SYNTAX[kind], unindexed ? UNINDEXED_NOTE : SCAN_NOTE[kind]].join('\n');
		hints.set(key, hint);
	}
	return hint;
}
