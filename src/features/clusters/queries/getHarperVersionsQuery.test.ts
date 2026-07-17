import { apiClient } from '@/config/apiClient';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	dedupeHarperVersionsByTag,
	getHarperVersionsOptions,
	HarperVersion,
	HarperVersionsResponse,
} from './getHarperVersionsQuery';

vi.mock('@/config/apiClient', () => ({
	apiClient: {
		get: vi.fn(),
	},
}));

const mockedGet = vi.mocked(apiClient.get);

beforeEach(() => {
	mockedGet.mockReset();
});

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

	it('discards a less-preferred tag that arrives after a more-preferred one', () => {
		const result = dedupeHarperVersionsByTag([
			{ name: 'stable', version: '5.1.21' },
			{ name: 'next', version: '5.1.21' },
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

describe('getHarperVersionsOptions', () => {
	it('configures the query to hit the HarperVersions cache key without retrying', () => {
		const options = getHarperVersionsOptions();
		expect(options.queryKey).toEqual(['HarperVersions']);
		expect(options.staleTime).toBe(60_000);
		expect(options.retry).toBe(false);
	});

	it('fetches the versions and dedupes overlapping tags, keeping the rest of the response', async () => {
		mockedGet.mockResolvedValue({
			data: {
				name: 'Harper Versions',
				description: 'Available Harper versions',
				value: [
					{ name: 'next', version: '5.1.21' },
					{ name: 'stable', version: '5.1.21' },
					{ name: 'beta', version: '5.2.0' },
				],
			} satisfies HarperVersionsResponse,
		});

		const options = getHarperVersionsOptions();
		const result = await (options.queryFn as () => Promise<HarperVersionsResponse>)();

		expect(mockedGet).toHaveBeenCalledWith('/HarperVersions/');
		expect(result).toEqual({
			name: 'Harper Versions',
			description: 'Available Harper versions',
			value: [
				{ name: 'stable', version: '5.1.21' },
				{ name: 'beta', version: '5.2.0' },
			],
		});
	});
});
