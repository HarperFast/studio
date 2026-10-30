import { focusManager, onlineManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	gitHubRepositoryCommand,
	gitHubRepositoryQueryOptions,
	lookUpGitHubRepository,
	parseGitHubRepository,
	parseGitHubRepositoryIdentity,
} from './lookUpGitHubRepository';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	focusManager.setFocused(undefined);
	onlineManager.setOnline(true);
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

describe('parseGitHubRepositoryIdentity', () => {
	it('reads the line the command prints', () => {
		expect(gitHubRepositoryCommand('acme/shop')).toBe('gh api repos/acme/shop --jq \'"\\(.id) \\(.full_name)"\'');
		expect(parseGitHubRepositoryIdentity(' 123456 Acme/Shop\n')).toEqual({ id: '123456', fullName: 'Acme/Shop' });
	});

	it.each(['', '123456', 'Acme/Shop', '0 Acme/Shop', 'abc Acme/Shop', '123 Acme', '123 Acme/Shop extra'])(
		'refuses %j',
		(input) => {
			expect(parseGitHubRepositoryIdentity(input)).toBeUndefined();
		},
	);
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
			expect.objectContaining({
				headers: { Accept: 'application/vnd.github+json' },
				signal: expect.any(AbortSignal),
			}),
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

	it('gives up on a GitHub that accepts the connection and then says nothing', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((_url: string, { signal }: { signal: AbortSignal }) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener('abort', () => reject(signal.reason));
				})
			),
		);
		vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
			const controller = new AbortController();
			setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')));
			return controller.signal;
		});
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

describe('gitHubRepositoryQueryOptions', () => {
	const lookedUp = async (status: number) => {
		const fetchMock = vi.fn(async () => new Response('{}', { status }));
		vi.stubGlobal('fetch', fetchMock);
		const client = new QueryClient();
		// Only a mounted client hears the focus and online managers.
		client.mount();
		const observe = () => {
			const observer = new QueryObserver(client, gitHubRepositoryQueryOptions('acme/shop'));
			return { observer, unsubscribe: observer.subscribe(() => undefined) };
		};
		const { observer, unsubscribe } = observe();
		await vi.waitFor(() => expect(observer.getCurrentResult().data).toBeDefined());
		return {
			fetchMock,
			observe,
			finish: () => {
				unsubscribe();
				client.unmount();
			},
		};
	};
	const settle = () => new Promise((resolve) => setTimeout(resolve));

	it.each([404, 403])('spends no lookup on returning to the tab after a %i, however stale', async (status) => {
		const { fetchMock, finish } = await lookedUp(status);
		const later = Date.now() + 60 * 60_000;
		vi.spyOn(Date, 'now').mockReturnValue(later);
		focusManager.setFocused(false);
		focusManager.setFocused(true);
		await settle();
		onlineManager.setOnline(false);
		onlineManager.setOnline(true);
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		finish();
	});

	it('asks again about a name GitHub did not find only once a minute has passed', async () => {
		const { fetchMock, observe, finish } = await lookedUp(404);
		const second = observe();
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		second.unsubscribe();

		const later = Date.now() + 61_000;
		vi.spyOn(Date, 'now').mockReturnValue(later);
		const third = observe();
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		third.unsubscribe();
		finish();
	});
});
