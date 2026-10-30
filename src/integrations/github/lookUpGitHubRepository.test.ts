import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookUpGitHubRepository, parseGitHubRepository } from './lookUpGitHubRepository';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('parseGitHubRepository', () => {
	it.each([
		['acme/shop', 'acme/shop'],
		['  acme/shop  ', 'acme/shop'],
		['Acme.Inc/my_shop-2', 'Acme.Inc/my_shop-2'],
		['https://github.com/acme/shop', 'acme/shop'],
		['https://github.com/acme/shop.git', 'acme/shop'],
		['https://www.github.com/acme/shop/', 'acme/shop'],
		['https://github.com/acme/shop/tree/main', 'acme/shop'],
		['git@github.com:acme/shop.git', 'acme/shop'],
		['ssh://git@github.com/acme/shop.git', 'acme/shop'],
		['git+https://github.com/acme/shop.git', 'acme/shop'],
	])('reads %s', (input, expected) => {
		expect(parseGitHubRepository(input)).toBe(expected);
	});

	it.each([
		'',
		'shop',
		'acme/',
		'/shop',
		'acme/shop/extra',
		'acme/sh op',
		'../shop',
		'acme/..',
		'https://gitlab.com/acme/shop',
		'https://github.com.evil.example/acme/shop',
		'git@gitlab.com:acme/shop.git',
	])('refuses %j', (input) => {
		expect(parseGitHubRepository(input)).toBeUndefined();
	});
});

describe('lookUpGitHubRepository', () => {
	const stubResponse = (status: number, body?: unknown) => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(body ?? {}), { status }));
		vi.stubGlobal('fetch', fetchMock);
		return fetchMock;
	};

	it("answers with GitHub's spelling and the id as a string", async () => {
		const fetchMock = stubResponse(200, {
			id: 219919692,
			full_name: 'HarperFast/studio',
			private: false,
			default_branch: 'stage',
		});
		await expect(lookUpGitHubRepository('harperfast/studio')).resolves.toEqual({
			status: 'found',
			repository: { id: '219919692', fullName: 'HarperFast/studio', private: false, defaultBranch: 'stage' },
		});
		expect(fetchMock.mock.calls[0]).toEqual([
			'https://api.github.com/repos/harperfast/studio',
			{ headers: { Accept: 'application/vnd.github+json' } },
		]);
	});

	it('reads a 404 as not found, which a private repository also answers', async () => {
		stubResponse(404, { message: 'Not Found' });
		await expect(lookUpGitHubRepository('acme/private')).resolves.toEqual({ status: 'not-found' });
	});

	it.each([403, 429])('reads a %i as the rate limit, so the form does not call the name wrong', async (status) => {
		stubResponse(status);
		await expect(lookUpGitHubRepository('acme/shop')).resolves.toEqual({ status: 'rate-limited' });
	});

	it('reads a server error or a malformed answer as unavailable', async () => {
		stubResponse(502);
		await expect(lookUpGitHubRepository('acme/shop')).resolves.toEqual({ status: 'unavailable' });
		stubResponse(200, { id: 'not-a-number', full_name: 'acme/shop' });
		await expect(lookUpGitHubRepository('acme/shop')).resolves.toEqual({ status: 'unavailable' });
	});

	it('never rejects: an unreachable GitHub is an answer the form acts on', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('Failed to fetch');
			}),
		);
		await expect(lookUpGitHubRepository('acme/shop')).resolves.toEqual({ status: 'unavailable' });
	});
});
