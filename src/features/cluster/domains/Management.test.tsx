/**
 * @vitest-environment jsdom
 */
import { MutationCache, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { PropsWithChildren, Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post, put, del } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get, post, put, delete: del } }));

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
	Link: ({ children }: PropsWithChildren) => <a>{children}</a>,
}));

vi.mock('sonner', () => ({
	toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('@/hooks/usePermissions', () => ({
	useOrganizationRolePermissions: () => ({ create: true, update: true, remove: true, view: true }),
}));

// The table's ChallengeCertificate poll builds its own client and sets `retry`/`refetchInterval`
// that override this test client's `retry: false`, so without this it issues real retried XHR.
const { instancePost } = vi.hoisted(() => ({ instancePost: vi.fn() }));
vi.mock('@/config/getInstanceClient', () => ({ getInstanceClient: () => ({ post: instancePost }) }));

import { mutationErrorHandler } from '@/react-query/queryClient';
import { toast } from 'sonner';

import { DomainsManagement } from './Management';

/** Traced from central-manager's `addDomain` through Harper's REST problem-details serializer. */
function conflict(): AxiosError {
	return {
		isAxiosError: true,
		response: {
			status: 409,
			data: { type: 'error:ClientError', code: 'ClientError', title: 'Domain already exists', status: 409 },
		},
	} as AxiosError;
}

function renderManagement() {
	const queryClient = new QueryClient({
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return {
		queryClient,
		...render(
			<QueryClientProvider client={queryClient}>
				<Suspense fallback={<div>loading</div>}>
					<DomainsManagement />
				</Suspense>
			</QueryClientProvider>,
		),
	};
}

function domainListFetches(): number {
	return get.mock.calls.filter((call) => String(call[0]).startsWith('/Domain/')).length;
}

function addButton(container: HTMLElement): HTMLButtonElement {
	// `[type=submit]`, not the button's text: "Add www as well" also contains "Add".
	return container.querySelector<HTMLButtonElement>('form#cluster-add-domain-form button[type="submit"]')!;
}

function submitWith(container: HTMLElement, domain: string) {
	const input = container.querySelector('input[name="domain"]')!;
	fireEvent.change(input, { target: { value: domain } });
	fireEvent.submit(container.querySelector('form#cluster-add-domain-form')!);
}

beforeEach(() => {
	instancePost.mockResolvedValue({ status: 200, data: [] });
	get.mockImplementation((url: string) =>
		url.startsWith('/Domain/')
			? Promise.resolve({ data: [] })
			: Promise.resolve({ data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: [] } })
	);
});

// `clearAllMocks` keeps implementations, so a `post.mockRejectedValue` would leak into the next
// test; reset so a test that forgets to set `post` fails instead of inheriting one.
afterEach(() => vi.resetAllMocks());

describe('DomainsManagement — adding a domain', () => {
	it('states the conflict under the input instead of only in a toast that fades', async () => {
		post.mockRejectedValue(conflict());
		const { container, findByText } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());

		submitWith(container, 'example.com');

		expect((await findByText(/example\.com — Domain already exists/)).textContent).toBeTruthy();
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('keeps the domain that was created and asks again only for the one that conflicted', async () => {
		post.mockImplementation((_url: string, body: { domain: string }) =>
			body.domain === 'www.example.com' ? Promise.reject(conflict()) : Promise.resolve({ data: { id: 'dom-1' } })
		);
		const { container, findByText } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());

		submitWith(container, 'example.com, www.example.com');

		await findByText(/www\.example\.com — Domain already exists/);
		expect(toast.success).toHaveBeenCalledOnce();
		expect(String(vi.mocked(toast.success).mock.calls[0][0])).toContain('1 Domain added');
		expect(container.querySelector<HTMLInputElement>('input[name="domain"]')!.value).toBe('www.example.com');
	});

	it('clears the input and the message once every domain is accepted', async () => {
		post.mockResolvedValue({ data: { id: 'dom-1' } });
		const { container, queryByText } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());

		submitWith(container, 'example.com');

		await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
		expect(container.querySelector<HTMLInputElement>('input[name="domain"]')!.value).toBe('');
		expect(queryByText(/Domain already exists/)).toBeNull();
	});

	it('refetches the list even when the add reported a failure, because the record may exist anyway', async () => {
		// A POST that created the domain and then timed out reports as a rejection. Without a
		// refetch the new record is invisible and every retry conflicts.
		post.mockRejectedValue({
			isAxiosError: true,
			code: 'ECONNABORTED',
			message: 'timeout of 0ms exceeded',
		} as AxiosError);
		const { container, findByText } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());
		const before = domainListFetches();

		submitWith(container, 'example.com');

		await findByText(/example\.com — timeout of 0ms exceeded/);
		await waitFor(() => expect(domainListFetches()).toBeGreaterThan(before));
	});

	it('states the conflict even though the org list contains the domain — owning it is why it 409d', async () => {
		post.mockRejectedValue(conflict());
		get.mockImplementation((url: string) =>
			url.startsWith('/Domain/')
				? Promise.resolve({ data: [{ id: 'dom-1', domain: 'example.com', status: 'ACTIVE' }] })
				: Promise.resolve({ data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: [] } })
		);
		const { container, findByText } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());

		submitWith(container, 'example.com');

		await findByText(/example\.com — Domain already exists/);
		expect(toast.success).not.toHaveBeenCalled();
		expect(container.querySelector<HTMLInputElement>('input[name="domain"]')!.value).toBe('example.com');
	});

	it('does not credit an owned domain whose POST died without a response — it was there before', async () => {
		post.mockRejectedValue({
			isAxiosError: true,
			code: 'ECONNABORTED',
			message: 'timeout of 0ms exceeded',
		} as AxiosError);
		get.mockImplementation((url: string) =>
			url.startsWith('/Domain/')
				? Promise.resolve({ data: [{ id: 'dom-1', domain: 'example.com', status: 'ACTIVE' }] })
				: Promise.resolve({ data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: [] } })
		);
		const { container, findByText } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());

		submitWith(container, 'example.com');

		await findByText(/example\.com — timeout of 0ms exceeded/);
		expect(toast.success).not.toHaveBeenCalled();
	});

	it('believes the refreshed list over the rejection when a timed-out POST actually committed', async () => {
		post.mockRejectedValue({
			isAxiosError: true,
			code: 'ECONNABORTED',
			message: 'timeout of 0ms exceeded',
		} as AxiosError);
		let listed: unknown[] = [];
		get.mockImplementation((url: string) =>
			url.startsWith('/Domain/')
				? Promise.resolve({ data: listed })
				: Promise.resolve({ data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: [] } })
		);
		const { container, queryByText } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());
		listed = [{ id: 'dom-1', domain: 'example.com', status: 'PENDING_VALIDATION' }];

		submitWith(container, 'example.com');

		await waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
		expect(queryByText(/timeout of 0ms exceeded/)).toBeNull();
		expect(container.querySelector<HTMLInputElement>('input[name="domain"]')!.value).toBe('');
	});

	it('keeps Add disabled until the whole submit finishes, not just the mutation', async () => {
		post.mockResolvedValue({ data: { id: 'dom-1' } });
		let releaseRefetch: () => void = () => {};
		const held = new Promise<{ data: unknown[] }>((resolve) => {
			releaseRefetch = () => resolve({ data: [] });
		});
		let domainGets = 0;
		get.mockImplementation((url: string) => {
			if (url.startsWith('/Domain/')) {
				domainGets += 1;
				return domainGets === 1 ? Promise.resolve({ data: [] }) : held;
			}
			return Promise.resolve({ data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: [] } });
		});
		const { container } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());

		submitWith(container, 'example.com');

		await waitFor(() => expect(post).toHaveBeenCalledOnce());
		await waitFor(() => expect(addButton(container).disabled).toBe(true));
		releaseRefetch();
		await waitFor(() => expect(addButton(container).disabled).toBe(false));
	});

	it('refuses a stray paste instead of firing one POST per token', async () => {
		const { container, findByText } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());

		submitWith(container, Array.from({ length: 40 }, (_, i) => `d${i}.example.com`).join(' '));

		await findByText(/Add at most 20 at a time/);
		expect(post).not.toHaveBeenCalled();
	});

	it('still runs the add while offline instead of pausing the mutation and hanging the form', async () => {
		// `onlineManager`, not a `navigator.onLine` spy: React Query gates on the former, and with
		// the default `networkMode` it pauses the mutation before `mutationFn` — `mutateAsync`
		// never settles and the form locks with no message.
		post.mockRejectedValue({ isAxiosError: true, code: 'ERR_NETWORK', message: 'Network Error' } as AxiosError);
		const { container, findByText } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());
		// Connectivity drops after the page loaded — offline from the start, the suspense query
		// pauses and there is no form to submit.
		onlineManager.setOnline(false);
		try {
			const listFetchesBefore = domainListFetches();

			submitWith(container, 'example.com');

			await findByText(/example\.com — Network Error/);
			expect(post).toHaveBeenCalledOnce();
			// No reconcile attempt: React Query would pause it, so waiting would only delay this.
			expect(domainListFetches()).toBe(listFetchesBefore);
			expect(addButton(container).disabled).toBe(false);
		} finally {
			onlineManager.setOnline(true);
		}
	});

	it('locks "Add www as well" during a submit, since settling rewrites the field it writes', async () => {
		post.mockResolvedValue({ data: { id: 'dom-1' } });
		let releaseRefetch: () => void = () => {};
		const held = new Promise<{ data: unknown[] }>((resolve) => {
			releaseRefetch = () => resolve({ data: [] });
		});
		let domainGets = 0;
		get.mockImplementation((url: string) => {
			if (url.startsWith('/Domain/')) {
				domainGets += 1;
				return domainGets === 1 ? Promise.resolve({ data: [] }) : held;
			}
			return Promise.resolve({ data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: [] } });
		});
		const { container } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());
		const wwwButton = () =>
			[...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Add www as well'));

		// An apex domain is what surfaces the button at all.
		submitWith(container, 'example.com');

		await waitFor(() => expect(post).toHaveBeenCalledOnce());
		await waitFor(() => expect(wwwButton()?.disabled).toBe(true));
		releaseRefetch();
		await waitFor(() => expect(container.querySelector<HTMLInputElement>('input[name="domain"]')!.value).toBe(''));
	});

	it('locks the form until the domain list has loaded, since crediting needs a pre-submit list', async () => {
		let releaseList: () => void = () => {};
		const held = new Promise<{ data: unknown[] }>((resolve) => {
			releaseList = () => resolve({ data: [] });
		});
		get.mockImplementation((url: string) =>
			url.startsWith('/Domain/')
				? held
				: Promise.resolve({ data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: [] } })
		);
		const { container } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());

		expect(container.querySelector<HTMLInputElement>('input[name="domain"]')!.disabled).toBe(true);
		expect(addButton(container).disabled).toBe(true);

		releaseList();

		await waitFor(() => expect(addButton(container).disabled).toBe(false));
		expect(container.querySelector<HTMLInputElement>('input[name="domain"]')!.disabled).toBe(false);
	});

	it('unlocks the form when the domain list fails to load, rather than stranding it', async () => {
		get.mockImplementation((url: string) =>
			url.startsWith('/Domain/')
				? Promise.reject(new AxiosError('Network Error', 'ERR_NETWORK'))
				: Promise.resolve({ data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: [] } })
		);
		const { container } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());

		await waitFor(() => expect(addButton(container).disabled).toBe(false));
	});

	it('refuses an oversized paste with its own message, not the empty-input one', async () => {
		const { container, findByText } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());

		submitWith(container, 'a.example.com, '.repeat(600));

		await findByText(/too much text to be domain names/);
		expect(post).not.toHaveBeenCalled();
	});

	it('says something on a punctuation-only submit instead of doing nothing at all', async () => {
		const { container, findByText } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());

		submitWith(container, ',,');

		await findByText(/Enter a domain name/);
		expect(post).not.toHaveBeenCalled();
	});

	it('locks the input while the submit runs, since settling rewrites it', async () => {
		post.mockResolvedValue({ data: { id: 'dom-1' } });
		let releaseRefetch: () => void = () => {};
		const held = new Promise<{ data: unknown[] }>((resolve) => {
			releaseRefetch = () => resolve({ data: [] });
		});
		let domainGets = 0;
		get.mockImplementation((url: string) => {
			if (url.startsWith('/Domain/')) {
				domainGets += 1;
				return domainGets === 1 ? Promise.resolve({ data: [] }) : held;
			}
			return Promise.resolve({ data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: [] } });
		});
		const { container } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());
		const input = () => container.querySelector<HTMLInputElement>('input[name="domain"]')!;

		submitWith(container, 'example.com');

		await waitFor(() => expect(post).toHaveBeenCalledOnce());
		await waitFor(() => expect(input().disabled).toBe(true));
		releaseRefetch();
		await waitFor(() => expect(input().disabled).toBe(false));
	});

	it('does not wait on the list when every failure was determinate — it cannot change the verdict', async () => {
		post.mockRejectedValue(conflict());
		let domainGets = 0;
		get.mockImplementation((url: string) => {
			if (url.startsWith('/Domain/')) {
				domainGets += 1;
				return Promise.resolve({ data: [] });
			}
			return Promise.resolve({ data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: [] } });
		});
		const { container, findByText } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());
		const before = domainGets;

		submitWith(container, 'example.com');

		await findByText(/example\.com — Domain already exists/);
		expect(domainGets).toBe(before);
	});

	it('drops the message on a resubmit that succeeds, so a stale failure cannot linger', async () => {
		post.mockRejectedValueOnce(conflict());
		const { container, findByText, queryByText } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());

		submitWith(container, 'example.com');
		await findByText(/example\.com — Domain already exists/);

		post.mockResolvedValue({ data: { id: 'dom-1' } });
		submitWith(container, 'example.com');

		await waitFor(() => expect(queryByText(/Domain already exists/)).toBeNull());
	});
});

describe('DomainsManagement — binding and unbinding', () => {
	const boundDomains = [
		{ id: 'dom-a', domain: 'a.example.com', status: 'ACTIVE', clusterId: 'clu-1', organizationId: 'org-1' },
		{ id: 'dom-b', domain: 'b.example.com', status: 'ACTIVE', clusterId: 'clu-1', organizationId: 'org-1' },
	];

	function serve(domains: object[], clusterDomainIds: () => string[]) {
		get.mockImplementation((url: string) =>
			url.startsWith('/Domain/')
				? Promise.resolve({ data: domains })
				: Promise.resolve({
					data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: clusterDomainIds() },
				})
		);
	}

	function sentBody(call = 0): unknown {
		expect(put.mock.calls[call][0]).toBe('/Cluster/clu-1');
		return JSON.parse(JSON.stringify(put.mock.calls[call][1]));
	}

	async function unbind(findByText: (text: string) => Promise<HTMLElement>, domain: string) {
		const row = (await findByText(domain)).closest('tr')!;
		fireEvent.click(within(row).getByRole('button', { name: 'Unbind Domain' }));
	}

	it('leaves cert intent alone when unbinding one domain, so the domains still bound keep theirs', async () => {
		put.mockResolvedValue({ data: {} });
		serve(boundDomains, () => ['dom-a', 'dom-b']);
		const { findByText } = renderManagement();

		await unbind(findByText, 'a.example.com');

		await waitFor(() => expect(put).toHaveBeenCalledOnce());
		expect(sentBody()).toEqual({ domainIds: ['dom-b'] });
	});

	it('unbinds against the cluster as it is now, not as it was when the page mounted', async () => {
		put.mockResolvedValue({ data: {} });
		let clusterDomainIds = ['dom-a'];
		let releaseDomainList!: () => void;
		const domainListHeld = new Promise<void>((resolve) => {
			releaseDomainList = resolve;
		});
		get.mockImplementation((url: string) =>
			url.startsWith('/Domain/')
				? domainListHeld.then(() => ({ data: boundDomains }))
				: Promise.resolve({
					data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: clusterDomainIds },
				})
		);
		const { container, findByText, queryClient } = renderManagement();
		await waitFor(() => expect(container.querySelector('input[name="domain"]')).not.toBeNull());

		clusterDomainIds = ['dom-a', 'dom-b'];
		await queryClient.refetchQueries({ queryKey: ['clu-1'], exact: true });
		releaseDomainList();

		await unbind(findByText, 'a.example.com');

		await waitFor(() => expect(put).toHaveBeenCalledOnce());
		expect(sentBody()).toEqual({ domainIds: ['dom-b'] });
	});

	it('builds the next change on the list the last one left, without waiting for the cluster poll', async () => {
		let clusterDomainIds = ['dom-a', 'dom-b'];
		put.mockImplementation((_url: string, body: { domainIds: string[] }) => {
			clusterDomainIds = body.domainIds;
			return Promise.resolve({ data: {} });
		});
		serve(boundDomains, () => clusterDomainIds);
		const { findByText, getByText } = renderManagement();

		await unbind(findByText, 'a.example.com');
		await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Domain unbound!'));
		const unbindB = await waitFor(() => {
			const button = within(getByText('b.example.com').closest('tr')!).getByRole('button', {
				name: 'Unbind Domain',
			}) as HTMLButtonElement;
			expect(button.disabled).toBe(false);
			return button;
		});
		fireEvent.click(unbindB);

		await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
		expect(sentBody(1)).toEqual({ domainIds: [] });
	});

	it('builds the next change on the list the last one left even when re-reading the cluster fails', async () => {
		let changed = false;
		put.mockImplementation(() => {
			changed = true;
			return Promise.resolve({ data: {} });
		});
		get.mockImplementation((url: string) => {
			if (url.startsWith('/Domain/')) {
				return Promise.resolve({ data: boundDomains });
			}
			return changed
				? Promise.reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK))
				: Promise.resolve({
					data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: ['dom-a', 'dom-b'] },
				});
		});
		const { findByText, getByText } = renderManagement();

		await unbind(findByText, 'a.example.com');
		await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Domain unbound!'));
		await waitFor(() => expect(get.mock.calls.filter(([url]) => String(url) === '/Cluster/clu-1')).toHaveLength(2));
		const unbindB = await waitFor(() => {
			const button = within(getByText('b.example.com').closest('tr')!).getByRole('button', {
				name: 'Unbind Domain',
			}) as HTMLButtonElement;
			expect(button.disabled).toBe(false);
			return button;
		});
		fireEvent.click(unbindB);

		await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
		expect(sentBody(1)).toEqual({ domainIds: [] });
	});

	it('holds every domain action while one is in flight, since each sends the whole list', async () => {
		let settle!: () => void;
		put.mockReturnValue(
			new Promise((resolve) => {
				settle = () => resolve({ data: {} });
			}),
		);
		const unboundDomain = { id: 'dom-c', domain: 'c.example.com', status: 'ACTIVE', organizationId: 'org-1' };
		serve([...boundDomains, unboundDomain], () => ['dom-a', 'dom-b']);
		const { findByText, getByRole } = renderManagement();
		fireEvent.click(within((await findByText('c.example.com')).closest('tr')!).getByRole('checkbox'));
		const bind = getByRole('button', { name: /Bind 1 Domain/ }) as HTMLButtonElement;

		await unbind(findByText, 'a.example.com');

		await waitFor(() => expect(bind.disabled).toBe(true));
		settle();
		await waitFor(() => expect(bind.disabled).toBe(false));
	});

	it('refuses a second domain action queued before the first one disabled the controls', async () => {
		put.mockReturnValue(new Promise(() => {}));
		const unboundDomain = { id: 'dom-c', domain: 'c.example.com', status: 'ACTIVE', organizationId: 'org-1' };
		serve([...boundDomains, unboundDomain], () => ['dom-a', 'dom-b']);
		const { findByText, getByRole } = renderManagement();
		fireEvent.click(within((await findByText('c.example.com')).closest('tr')!).getByRole('checkbox'));
		const unbindA = within((await findByText('a.example.com')).closest('tr')!).getByRole('button', {
			name: 'Unbind Domain',
		});
		const bind = getByRole('button', { name: /Bind 1 Domain/ });

		fireEvent.click(unbindA);
		fireEvent.click(bind);

		await waitFor(() => expect(put).toHaveBeenCalled());
		expect(put).toHaveBeenCalledOnce();
		expect(sentBody()).toEqual({ domainIds: ['dom-b'] });
	});

	it('still asks for certificates when binding', async () => {
		put.mockResolvedValue({ data: {} });
		serve([{ id: 'dom-c', domain: 'c.example.com', status: 'ACTIVE', organizationId: 'org-1' }], () => []);
		const { findByText, getByRole } = renderManagement();

		const row = (await findByText('c.example.com')).closest('tr')!;
		fireEvent.click(within(row).getByRole('checkbox'));
		fireEvent.click(getByRole('button', { name: /Bind 1 Domain/ }));

		await waitFor(() => expect(put).toHaveBeenCalledOnce());
		expect(sentBody()).toEqual({ domainIds: ['dom-c'], generateDomainCerts: true });
	});

	describe('a ticked domain the list no longer offers', () => {
		const unboundC = { id: 'dom-c', domain: 'c.example.com', status: 'ACTIVE', organizationId: 'org-1' };
		const unboundD = { id: 'dom-d', domain: 'd.example.com', status: 'ACTIVE', organizationId: 'org-1' };

		function serveList(list: () => object[]) {
			get.mockImplementation((url: string) =>
				url.startsWith('/Domain/')
					? Promise.resolve({ data: list() })
					: Promise.resolve({ data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: [] } })
			);
		}

		function rowOf(getByText: (text: string) => HTMLElement, domain: string) {
			return within(getByText(domain).closest('tr')!);
		}

		async function tickBoth(
			findByText: (text: string) => Promise<HTMLElement>,
			getByText: (text: string) => HTMLElement,
		) {
			await findByText('c.example.com');
			fireEvent.click(rowOf(getByText, 'c.example.com').getByRole('checkbox'));
			fireEvent.click(rowOf(getByText, 'd.example.com').getByRole('checkbox'));
		}

		it('is not sent by Bind once it has been removed, without waiting for the list to refetch', async () => {
			let removed = false;
			get.mockImplementation((url: string) => {
				if (!url.startsWith('/Domain/')) {
					return Promise.resolve({ data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: [] } });
				}
				return removed ? new Promise(() => {}) : Promise.resolve({ data: [unboundC, unboundD] });
			});
			del.mockImplementation(() => {
				removed = true;
				return Promise.resolve({ data: undefined });
			});
			put.mockResolvedValue({ data: {} });
			const { findByText, getByText, findByRole } = renderManagement();
			await tickBoth(findByText, getByText);

			fireEvent.click(rowOf(getByText, 'c.example.com').getByRole('button', { name: 'Remove Domain' }));

			await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Domain removed!'));
			const bind = await findByRole('button', { name: /Bind 1 Domain$/ }) as HTMLButtonElement;
			await waitFor(() => expect(bind.disabled).toBe(false));
			fireEvent.click(bind);

			await waitFor(() => expect(put).toHaveBeenCalledOnce());
			expect(sentBody()).toEqual({ domainIds: ['dom-d'], generateDomainCerts: true });
		});

		it('is not offered once the list shows it bound to another cluster', async () => {
			let list: object[] = [unboundC];
			serveList(() => list);
			const { findByText, getByText, queryByRole, queryClient } = renderManagement();
			await findByText('c.example.com');
			fireEvent.click(rowOf(getByText, 'c.example.com').getByRole('checkbox'));
			expect(queryByRole('button', { name: /Bind 1 Domain/ })).not.toBeNull();

			list = [{ ...unboundC, clusterId: 'clu-2' }];
			await queryClient.refetchQueries({ queryKey: ['org-1', 'domains'] });

			await waitFor(() => expect(queryByRole('button', { name: /Bind \d+ Domain/ })).toBeNull());
		});

		it('holds Bind while a removal is in flight', async () => {
			let settle!: () => void;
			serveList(() => [unboundC, unboundD]);
			del.mockReturnValue(
				new Promise((resolve) => {
					settle = () => resolve({ data: undefined });
				}),
			);
			const { findByText, getByText, getByRole } = renderManagement();
			await tickBoth(findByText, getByText);
			const bind = getByRole('button', { name: /Bind 2 Domains/ }) as HTMLButtonElement;

			fireEvent.click(rowOf(getByText, 'c.example.com').getByRole('button', { name: 'Remove Domain' }));

			await waitFor(() => expect(bind.disabled).toBe(true));
			settle();
			await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Domain removed!'));
		});

		it('refuses a Bind queued behind a removal before the controls disabled', async () => {
			serveList(() => [unboundC, unboundD]);
			del.mockReturnValue(new Promise(() => {}));
			const { findByText, getByText, getByRole } = renderManagement();
			await tickBoth(findByText, getByText);
			const bind = getByRole('button', { name: /Bind 2 Domains/ });

			fireEvent.click(rowOf(getByText, 'c.example.com').getByRole('button', { name: 'Remove Domain' }));
			fireEvent.click(bind);

			await waitFor(() => expect(del).toHaveBeenCalledOnce());
			await waitFor(() => expect((bind as HTMLButtonElement).disabled).toBe(true));
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(put).not.toHaveBeenCalled();
		});

		it('is not removed by a click queued behind a Bind that is sending it', async () => {
			serveList(() => [unboundC, unboundD]);
			put.mockReturnValue(new Promise(() => {}));
			const { findByText, getByText, getByRole } = renderManagement();
			await tickBoth(findByText, getByText);
			const remove = rowOf(getByText, 'c.example.com').getByRole('button', { name: 'Remove Domain' });

			fireEvent.click(getByRole('button', { name: /Bind 2 Domains/ }));
			fireEvent.click(remove);

			await waitFor(() => expect(put).toHaveBeenCalledOnce());
			// Re-queried: the row re-renders as a new element once the controls disable.
			await waitFor(() =>
				expect(
					(rowOf(getByText, 'c.example.com').getByRole('button', { name: 'Remove Domain' }) as HTMLButtonElement)
						.disabled,
				).toBe(true)
			);
			expect(del).not.toHaveBeenCalled();
		});

		it('is not sent by a click that lands after the list changed but before the button re-rendered', async () => {
			serveList(() => [unboundC, unboundD]);
			put.mockResolvedValue({ data: {} });
			const { findByText, getByText, getByRole, queryClient } = renderManagement();
			await tickBoth(findByText, getByText);
			const bind = getByRole('button', { name: /Bind 2 Domains/ });

			// React Query notifies observers on a later tick, so the click below still runs the
			// handler from the render that showed both domains.
			queryClient.setQueryData(['org-1', 'domains'], [unboundD]);
			fireEvent.click(bind);

			await waitFor(() => expect(put).toHaveBeenCalledOnce());
			expect(sentBody()).toEqual({ domainIds: ['dom-d'], generateDomainCerts: true });
		});
	});

	it('re-reads certificate progress as soon as a domain change lands, rather than on the idle poll', async () => {
		put.mockResolvedValue({ data: {} });
		serve(boundDomains, () => ['dom-a', 'dom-b']);
		const { findByText } = renderManagement();
		await findByText('a.example.com');
		await waitFor(() => expect(instancePost).toHaveBeenCalledOnce());

		await unbind(findByText, 'a.example.com');

		await waitFor(() => expect(instancePost).toHaveBeenCalledTimes(2));
		expect(instancePost.mock.calls[1][1]).toMatchObject({
			operation: 'search_by_value',
			table: 'ChallengeCertificate',
		});
	});
});
