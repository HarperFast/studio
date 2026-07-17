import { describe, expect, it } from 'vitest';
import { dedupeHarperVersionsByTag, HarperVersion } from './getHarperVersionsQuery';

function tags(versions: HarperVersion[]) {
	return versions.map(({ version, name }) => `${version} ${name}`);
}

describe('dedupeHarperVersionsByTag', () => {
	it('keeps the most-preferred tag when a version appears more than once', () => {
		const result = dedupeHarperVersionsByTag([
			{ name: 'next', version: '5.1.21' },
			{ name: 'stable', version: '5.1.21' },
		]);
		expect(tags(result)).toEqual(['5.1.21 stable']);
	});

	it('applies the full preference order stable > next > beta > alpha', () => {
		const result = dedupeHarperVersionsByTag([
			{ name: 'alpha', version: '6.0.0' },
			{ name: 'beta', version: '6.0.0' },
			{ name: 'next', version: '6.0.0' },
		]);
		expect(tags(result)).toEqual(['6.0.0 next']);
	});

	it('prefers any known tag over an unknown one', () => {
		const result = dedupeHarperVersionsByTag([
			{ name: 'foobarbaz', version: '5.1.21' },
			{ name: 'alpha', version: '5.1.21' },
		]);
		expect(tags(result)).toEqual(['5.1.21 alpha']);
	});

	it('keeps a single unknown tag when there is nothing better', () => {
		const result = dedupeHarperVersionsByTag([
			{ name: 'foobarbaz', version: '5.1.21' },
		]);
		expect(tags(result)).toEqual(['5.1.21 foobarbaz']);
	});

	it('keeps distinct versions untouched and preserves their order', () => {
		const result = dedupeHarperVersionsByTag([
			{ name: 'stable', version: '5.1.21' },
			{ name: 'next', version: '5.2.0' },
			{ name: 'beta', version: '6.0.0' },
		]);
		expect(tags(result)).toEqual(['5.1.21 stable', '5.2.0 next', '6.0.0 beta']);
	});

	it('keeps each version at the position of its first appearance', () => {
		const result = dedupeHarperVersionsByTag([
			{ name: 'next', version: '5.1.21' },
			{ name: 'stable', version: '5.2.0' },
			{ name: 'stable', version: '5.1.21' },
		]);
		expect(tags(result)).toEqual(['5.1.21 stable', '5.2.0 stable']);
	});

	it('handles an empty list', () => {
		expect(dedupeHarperVersionsByTag([])).toEqual([]);
	});
});
