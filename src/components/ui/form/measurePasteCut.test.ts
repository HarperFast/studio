import { describe, expect, it } from 'vitest';
import { measurePasteCut } from './measurePasteCut';

const long = 'x'.repeat(312);

describe('measurePasteCut', () => {
	it('reports what an empty field kept of a longer paste', () => {
		expect(measurePasteCut({ text: long, before: '', after: long.slice(0, 80), selection: [0, 0], maxLength: 80 }))
			.toEqual({ pasted: 312, kept: 80 });
	});

	it('counts only the room left beside what the field already held', () => {
		const before = 'a'.repeat(10);
		const after = before + 'b'.repeat(70);
		expect(measurePasteCut({ text: 'b'.repeat(75), before, after, selection: [10, 10], maxLength: 80 }))
			.toEqual({ pasted: 75, kept: 70 });
	});

	it('counts the selection the paste replaces as room', () => {
		const before = 'a'.repeat(50);
		const text = 'b'.repeat(80);
		expect(measurePasteCut({ text, before, after: text, selection: [0, 50], maxLength: 80 })).toBeNull();
	});

	it('says none of it fit when the field was already full', () => {
		const full = 'a'.repeat(80);
		expect(measurePasteCut({ text: 'hello', before: full, after: full, selection: [80, 80], maxLength: 80 }))
			.toEqual({ pasted: 5, kept: 0 });
	});

	it('counts what landed when the browser stopped short of a surrogate pair', () => {
		const before = 'a'.repeat(79);
		expect(measurePasteCut({ text: '😀', before, after: before, selection: [79, 79], maxLength: 80 }))
			.toEqual({ pasted: 2, kept: 0 });
	});

	it('ignores a paste that fit exactly', () => {
		const text = 'b'.repeat(80);
		expect(measurePasteCut({ text, before: '', after: text, selection: [0, 0], maxLength: 80 })).toBeNull();
	});

	it('ignores the trailing line break a copied line carries, and counts each inner break as one space', () => {
		const text = `${'b'.repeat(39)}\r\n${'c'.repeat(40)}\n`;
		const after = `${'b'.repeat(39)} ${'c'.repeat(40)}`;
		expect(measurePasteCut({ text, before: '', after, selection: [0, 0], maxLength: 80 })).toBeNull();
	});

	it('ignores a paste that left the field short of its limit, which something other than the limit refused', () => {
		expect(measurePasteCut({ text: long, before: 'abc', after: 'abc', selection: [3, 3], maxLength: 80 })).toBeNull();
	});
});
