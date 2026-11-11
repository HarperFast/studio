import { FullTextValueHighlight } from '@/integrations/api/instance/database/searchFullText';
import { describe, expect, it } from 'vitest';
import { highlightedExcerpts, highlightSegments } from './fullTextHighlights';

/** Marked runs as `[…]`, for readable assertions. */
function marked(text: string, spans: { start: number; end: number }[]): string {
	return highlightSegments(text, spans).map(({ text, match }) => (match ? `[${text}]` : text)).join('');
}

describe('highlightSegments', () => {
	it('marks each span and keeps every character exactly once', () => {
		expect(marked('Waterproof trail running shoes', [{ start: 11, end: 24 }])).toBe('Waterproof [trail running] shoes');
		expect(marked('abc', [])).toBe('abc');
		expect(marked('', [])).toBe('');
	});

	it('sorts, merges and clamps whatever spans arrive', () => {
		expect(marked('abcdefgh', [{ start: 5, end: 7 }, { start: 0, end: 2 }, { start: 1, end: 3 }])).toBe('[abc]de[fg]h');
		expect(marked('abc', [{ start: 2, end: 99 }, { start: -4, end: 1 }, { start: 2, end: 2 }])).toBe('[a]b[c]');
	});
});

describe('highlightedExcerpts against real Harper 5.3.6 answers', () => {
	const description =
		'Grippy outsole for muddy trail running in the mountains, with a waterproof membrane that keeps feet dry on long runs and river crossings.';

	it('marks spans inside each fragment, whose offsets are relative to the fragment', () => {
		// search_by_conditions `matches` "waterproof river", highlighting { maxFragments: 2, fragmentLength: 60 }.
		const entry: FullTextValueHighlight = {
			valueIndex: 0,
			spans: [{ start: 64, end: 74 }, { start: 121, end: 126 }],
			fragments: [
				{
					text: 'in the mountains, with a waterproof membrane that keeps feet',
					start: 39,
					spans: [{ start: 25, end: 35 }],
				},
				{
					text: 'mbrane that keeps feet dry on long runs and river crossings.',
					start: 77,
					spans: [{ start: 44, end: 49 }],
				},
			],
		};
		const excerpts = highlightedExcerpts(description, entry);
		expect(excerpts.map(excerpt => excerpt.segments.filter(s => s.match).map(s => s.text))).toEqual([
			['waterproof'],
			['river'],
		]);
		expect(excerpts.map(({ leadingEllipsis, trailingEllipsis }) => [leadingEllipsis, trailingEllipsis])).toEqual([
			[true, true],
			[true, false],
		]);
	});

	it('uses UTF-16 offsets, as JavaScript strings do', () => {
		// The answer for a title of "🥾🥾 hiking boots": each boot is two UTF-16 code units.
		const entry: FullTextValueHighlight = {
			valueIndex: 0,
			spans: [{ start: 12, end: 17 }],
			fragments: [{ text: '🥾🥾 hiking boots', start: 0, spans: [{ start: 12, end: 17 }] }],
		};
		const [excerpt] = highlightedExcerpts('🥾🥾 hiking boots', entry);
		expect(excerpt.segments).toEqual([{ text: '🥾🥾 hiking ', match: false }, { text: 'boots', match: true }]);
		expect(excerpt.trailingEllipsis).toBe(false);
	});

	it('marks the value itself when Harper sent no fragments, picking a list item by valueIndex', () => {
		const [excerpt] = highlightedExcerpts(['road', 'trail running'], { valueIndex: 1, spans: [{ start: 0, end: 5 }] });
		expect(excerpt.segments).toEqual([{ text: 'trail', match: true }, { text: ' running', match: false }]);
	});

	it('shows nothing for a value it doesn’t have as text, such as a Blob without fragments', () => {
		expect(highlightedExcerpts({ size: 12 }, { valueIndex: 0, spans: [{ start: 0, end: 4 }] })).toEqual([]);
	});
});
