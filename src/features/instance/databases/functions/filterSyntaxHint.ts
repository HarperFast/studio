import { InstanceAttribute } from '@/integrations/api/api.patch';

export type FilterKind = 'text' | 'number' | 'date' | 'boolean';

// Must teach only what `parseComparator` reads; filterSyntaxHint.test.ts holds the two together.
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

function filterKind(type: InstanceAttribute['type']): FilterKind {
	if (NUMERIC_TYPES.has(type ?? '')) {
		return 'number';
	}
	return type === 'Date' ? 'date' : type === 'Boolean' ? 'boolean' : 'text';
}

const UNINDEXED_NOTE = 'Not indexed: a filter on this alone reads every record, so you are asked first.';
const NE_NOTE = '!= reads every record unless another filter uses an index.';
const SCAN_NOTE: Readonly<Record<FilterKind, string>> = {
	text: 'Ends with, contains and != read every record unless another filter uses an index.',
	number: NE_NOTE,
	date: NE_NOTE,
	boolean: NE_NOTE,
};

const hintsFor = (kind: FilterKind) => ({
	indexed: [...FILTER_SYNTAX[kind], SCAN_NOTE[kind]].join('\n'),
	unindexed: [...FILTER_SYNTAX[kind], UNINDEXED_NOTE].join('\n'),
});
// The grid rebuilds its columns on every render, keystrokes in a filter included.
const HINTS: Readonly<Record<FilterKind, { indexed: string; unindexed: string }>> = {
	text: hintsFor('text'),
	number: hintsFor('number'),
	date: hintsFor('date'),
	boolean: hintsFor('boolean'),
};

export function filterSyntaxHint(type: InstanceAttribute['type'], unindexed: boolean): string {
	const hints = HINTS[filterKind(type)];
	return unindexed ? hints.unindexed : hints.indexed;
}
