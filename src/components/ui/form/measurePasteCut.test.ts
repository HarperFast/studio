import { describe, expect, it } from 'vitest';
import { measurePasteCut } from './measurePasteCut';

const long = 'x'.repeat(312);

describe('measurePasteCut', () => {
	describe('with the selection known', () => {
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

	describe('with the selection hidden, as type="email" keeps it', () => {
		it('reports what an empty field kept', () => {
			expect(measurePasteCut({ text: long, before: '', after: long.slice(0, 80), selection: null, maxLength: 80 }))
				.toEqual({ pasted: 312, kept: 80 });
		});

		it('reports the whole limit kept when the paste replaced an address sharing its start', () => {
			const text = `alice@${'e'.repeat(100)}.com`;
			expect(
				measurePasteCut({ text, before: 'alice@x.com', after: text.slice(0, 80), selection: null, maxLength: 80 }),
			).toEqual({ pasted: text.length, kept: 80 });
		});

		it('ignores a paste that replaced the value and fit', () => {
			const text = `bob@${'e'.repeat(70)}.com`;
			expect(measurePasteCut({ text, before: 'alice@x.com', after: text, selection: null, maxLength: 78 }))
				.toBeNull();
		});

		it('says none of it fit when the full value did not change, though the paste matches part of it', () => {
			const full = `abc${'x'.repeat(77)}`;
			expect(measurePasteCut({ text: 'abc', before: full, after: full, selection: null, maxLength: 80 }))
				.toEqual({ pasted: 3, kept: 0 });
			expect(
				measurePasteCut({
					text: 'admin',
					before: 'admin@example.com',
					after: 'admin@example.com',
					selection: null,
					maxLength: 17,
				}),
			).toEqual({ pasted: 5, kept: 0 });
		});

		it('does not count text already in the field as pasted', () => {
			const before = `abcd${'z'.repeat(74)}`;
			expect(measurePasteCut({ text: 'abcdef', before, after: `${before}ab`, selection: null, maxLength: 80 }))
				.toEqual({ pasted: 6, kept: 2 });
		});

		it('ignores the surrounding whitespace an email field trims away', () => {
			const address = `${'e'.repeat(76)}.com`;
			expect(measurePasteCut({ text: `  ${address}\n`, before: '', after: address, selection: null, maxLength: 80 }))
				.toBeNull();
		});
	});
});
