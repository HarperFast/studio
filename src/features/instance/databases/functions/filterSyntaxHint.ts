import { InstanceAttribute } from '@/integrations/api/api.patch';

const NUMERIC_TYPES: ReadonlySet<string> = new Set(['Int', 'Long', 'Float', 'BigInt']);

/** The filter syntax `parseComparator` reads, worded for the attribute's type. */
export function filterSyntaxHint(type: InstanceAttribute['type'], unindexed: boolean): string {
	const isText = !NUMERIC_TYPES.has(type ?? '') && type !== 'Date' && type !== 'Boolean';
	const lines = NUMERIC_TYPES.has(type ?? '')
		? ['5 equals', '>5  >=5  <5  <=5', '!= 5 not equal', '>1 & <9 both']
		: type === 'Date'
		? ['2026-01-31 equals', '>2026-01-01  <=2026-12-31', '>2026-01-01 & <2026-02-01 both']
		: type === 'Boolean'
		? ['true or false', '!= true not equal']
		: [
			'Jo* starts with',
			'*hn ends with',
			'*oh* contains',
			'== Jo* exactly, star and all',
			'!= Jo not equal',
			'a & b both',
		];
	lines.push(
		unindexed
			? 'Not indexed: a filter on this alone reads every record, so you are asked first.'
			: isText
			? 'Ends with, contains and != read every record unless another filter uses an index.'
			: '!= reads every record unless another filter uses an index.',
	);
	return lines.join('\n');
}
