/**
 * @vitest-environment jsdom
 */
import { MutationCache, onlineManager, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { PropsWithChildren, Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post, put, del } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get, post, put, delete: del } }));

// One object, mutated rather than replaced: the page reads its params into dependency arrays.
const { routeParams } = vi.hoisted(() => ({ routeParams: { organizationId: 'org-1', clusterId: 'clu-1' } }));
vi.mock('@tanstack/react-router', () => ({
	useParams: () => routeParams,
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

import { mutationErrorHandler, queryErrorHandler } from '@/react-query/queryClient';
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
		queryCache: new QueryCache({ onError: queryErrorHandler }),
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	const page = () => (
		<QueryClientProvider client={queryClient}>
			<Suspense fallback={<div>loading</div>}>
				<DomainsManagement />
			</Suspense>
		</QueryClientProvider>
	);
	const rendered = render(page());
	return { queryClient, ...rendered, rerenderPage: () => rendered.rerender(page()) };
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
afterEach(() => {
	vi.resetAllMocks();
	routeParams.clusterId = 'clu-1';
});

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

	it('sends no change built on a cluster it could not re-read', async () => {
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
		const unbindB = await waitFor(() => {
			const button = within(getByText('b.example.com').closest('tr')!).getByRole('button', {
				name: 'Unbind Domain',
			}) as HTMLButtonElement;
			expect(button.disabled).toBe(false);
			return button;
		});
		fireEvent.click(unbindB);

		expect(await findByText("The domain change didn't go through: Network Error")).toBeTruthy();
		expect(put).toHaveBeenCalledOnce();
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

	describe("refetches the domain list through the page's own query client", () => {
		const unboundC = { id: 'dom-c', domain: 'c.example.com', status: 'ACTIVE', organizationId: 'org-1' };

		// Counted when the request goes out, so a read made before sending it can't pass for the refetch.
		let fetchesAtSend = 0;
		function answerCounting(data: unknown) {
			return () => {
				fetchesAtSend = domainListFetches();
				return Promise.resolve({ data });
			};
		}

		async function expectListRefetchedAfter(landed: string) {
			await waitFor(() => expect(toast.success).toHaveBeenCalledWith(landed));
			await waitFor(() => expect(domainListFetches()).toBeGreaterThan(fetchesAtSend));
		}

		it('once a bind lands', async () => {
			put.mockImplementation(answerCounting({}));
			serve([unboundC], () => []);
			const { findByText, getByRole } = renderManagement();
			fireEvent.click(within((await findByText('c.example.com')).closest('tr')!).getByRole('checkbox'));

			fireEvent.click(getByRole('button', { name: /Bind 1 Domain/ }));

			await expectListRefetchedAfter('Domain(s) bound! Certificates are being generated in the background now.');
		});

		it('once an unbind lands', async () => {
			put.mockImplementation(answerCounting({}));
			serve(boundDomains, () => ['dom-a', 'dom-b']);
			const { findByText } = renderManagement();

			await unbind(findByText, 'a.example.com');

			await expectListRefetchedAfter('Domain unbound!');
		});

		it('once a removal lands', async () => {
			del.mockImplementation(answerCounting(undefined));
			serve([unboundC], () => []);
			const { findByText } = renderManagement();
			const row = (await findByText('c.example.com')).closest('tr')!;

			fireEvent.click(within(row).getByRole('button', { name: 'Remove Domain' }));

			await expectListRefetchedAfter('Domain removed!');
		});
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

		it('is not offered or sent by Bind once it has been removed, without waiting for the list to refetch', async () => {
			let removed = false;
			get.mockImplementation((url: string) => {
				if (!url.startsWith('/Domain/')) {
					return Promise.resolve({ data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: [] } });
				}
				return Promise.resolve({ data: removed ? [unboundD] : [unboundC, unboundD] });
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

describe('DomainsManagement — a domain change central manager would refuse', () => {
	const domainA = {
		id: 'dom-a',
		domain: 'a.example.com',
		status: 'ACTIVE',
		clusterId: 'clu-1',
		organizationId: 'org-1',
	};
	const domainC = { id: 'dom-c', domain: 'c.example.com', status: 'ACTIVE', organizationId: 'org-1' };
	const instanceNotRunning =
		'Cluster has an instance that is not RUNNING (ins-1: FAILED). Resolve the instance before the update.';
	const shownForInstanceNotRunning = `The domain change didn't go through: ${instanceNotRunning}`;

	/** Central manager's `assertClusterMutable` refusal, through Harper's REST problem-details serializer. */
	function refused(title: string): AxiosError {
		return {
			isAxiosError: true,
			message: 'Request failed with status code 400',
			response: { status: 400, data: { type: 'error:ClientError', code: 'ClientError', title, status: 400 } },
		} as AxiosError;
	}

	function serve(domains: () => object[], cluster: object = {}) {
		get.mockImplementation((url: string) =>
			url.startsWith('/Domain/')
				? Promise.resolve({ data: domains() })
				: Promise.resolve({
					data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: ['dom-a'], ...cluster },
				})
		);
	}

	type Rendered = ReturnType<typeof renderManagement>;

	async function tickC({ findByText }: Rendered) {
		fireEvent.click(within((await findByText('c.example.com')).closest('tr')!).getByRole('checkbox'));
	}

	async function bindC(rendered: Rendered) {
		await tickC(rendered);
		fireEvent.click(rendered.getByRole('button', { name: /Bind 1 Domain/ }));
	}

	async function unbindA({ findByText }: Rendered) {
		fireEvent.click(
			within((await findByText('a.example.com')).closest('tr')!).getByRole('button', { name: 'Unbind Domain' }),
		);
	}

	let consoleError: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => consoleError.mockRestore());

	it("keeps central manager's reason on the page when it refuses a bind, instead of a toast that fades", async () => {
		serve(() => [domainA, domainC]);
		put.mockRejectedValue(refused(instanceNotRunning));
		const rendered = renderManagement();

		await bindC(rendered);

		expect((await rendered.findByText(shownForInstanceNotRunning)).getAttribute('role')).toBe('alert');
		expect(toast.error).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ response: expect.anything() }));
	});

	it('shows a refused unbind the same way', async () => {
		serve(() => [domainA, domainC]);
		put.mockRejectedValue(refused(instanceNotRunning));
		const rendered = renderManagement();

		await unbindA(rendered);

		expect(await rendered.findByText(shownForInstanceNotRunning)).toBeTruthy();
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('drops the reason once the next change goes through', async () => {
		serve(() => [domainA, domainC]);
		put.mockRejectedValueOnce(refused(instanceNotRunning)).mockResolvedValue({ data: {} });
		const rendered = renderManagement();
		await bindC(rendered);
		await rendered.findByText(shownForInstanceNotRunning);

		const bind = rendered.getByRole('button', { name: /Bind 1 Domain/ }) as HTMLButtonElement;
		await waitFor(() => expect(bind.disabled).toBe(false));
		fireEvent.click(bind);

		await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(rendered.queryByText(shownForInstanceNotRunning)).toBeNull());
	});

	// UPDATED is the trap: Studio's `isRunning` counts it as running, and central manager does not.
	it.each(['FAILED', 'STOPPED', 'UPDATED'])('sends nothing while an instance is %s, and says which', async (status) => {
		serve(() => [domainA, domainC], {
			instances: [
				{ id: 'ins-2', instanceFqdn: 'node-2.example.com', status: 'RUNNING' },
				{ id: 'ins-1', instanceFqdn: 'node-1.example.com', status },
			],
		});
		const rendered = renderManagement();

		await bindC(rendered);

		expect(await rendered.findByText(/Instance node-1\.example\.com/)).toBeTruthy();
		expect(put).not.toHaveBeenCalled();
		expect(consoleError).not.toHaveBeenCalledWith(expect.any(Error));
	});

	it('sends no unbind while the cluster is not running', async () => {
		serve(() => [domainA, domainC], { status: 'UPDATING' });
		const rendered = renderManagement();

		await unbindA(rendered);

		expect(await rendered.findByText(/This cluster is UPDATING/)).toBeTruthy();
		expect(put).not.toHaveBeenCalled();
	});

	it('still sends a change while every instance is running or gone', async () => {
		serve(() => [domainA, domainC], {
			instances: [
				{ id: 'ins-1', instanceFqdn: 'node-1.example.com', status: 'RUNNING' },
				{ id: 'ins-2', instanceFqdn: 'node-2.example.com', status: 'TERMINATED' },
			],
		});
		put.mockResolvedValue({ data: {} });
		const rendered = renderManagement();

		await bindC(rendered);

		await waitFor(() => expect(put).toHaveBeenCalledOnce());
	});

	it('refuses a ticked domain the fresh list shows bound elsewhere, and stops offering it', async () => {
		let list: object[] = [domainA, domainC];
		serve(() => list);
		const rendered = renderManagement();
		await tickC(rendered);

		list = [domainA, { ...domainC, clusterId: 'clu-2' }];
		fireEvent.click(rendered.getByRole('button', { name: /Bind 1 Domain/ }));

		expect(await rendered.findByText(/c\.example\.com is bound to cluster clu-2/)).toBeTruthy();
		expect(put).not.toHaveBeenCalled();
		await waitFor(() => expect(rendered.queryByRole('button', { name: /Bind \d+ Domain/ })).toBeNull());
	});

	it('refuses every change while the cluster still lists a domain that no longer exists, and points at support', async () => {
		serve(() => [domainA, domainC], { domainIds: ['dom-a', 'dom-gone'] });
		const rendered = renderManagement();

		await unbindA(rendered);

		expect(await rendered.findByText(/still lists dom-gone, which isn't one of this organization's domains/))
			.toBeTruthy();
		expect(rendered.getByRole('link', { name: 'Contact us' })).toBeTruthy();
		expect(put).not.toHaveBeenCalled();
	});

	it('builds the list from the cluster as central manager has it, keeping a domain bound meanwhile', async () => {
		let clusterDomainIds = ['dom-a'];
		let domains: object[] = [domainA, domainC];
		const domainB = {
			id: 'dom-b',
			domain: 'b.example.com',
			status: 'ACTIVE',
			clusterId: 'clu-1',
			organizationId: 'org-1',
		};
		get.mockImplementation((url: string) =>
			url.startsWith('/Domain/')
				? Promise.resolve({ data: domains })
				: Promise.resolve({
					data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: clusterDomainIds },
				})
		);
		put.mockResolvedValue({ data: {} });
		const rendered = renderManagement();
		await tickC(rendered);

		// Another member binds dom-b; this page has not re-read the cluster since.
		clusterDomainIds = ['dom-a', 'dom-b'];
		domains = [domainA, domainB, domainC];
		fireEvent.click(rendered.getByRole('button', { name: /Bind 1 Domain/ }));

		await waitFor(() => expect(put).toHaveBeenCalledOnce());
		expect(JSON.parse(JSON.stringify(put.mock.calls[0][1]))).toEqual({
			domainIds: ['dom-a', 'dom-b', 'dom-c'],
			generateDomainCerts: true,
		});
	});

	it("does not show one cluster's failed change on another cluster's page", async () => {
		get.mockImplementation((url: string) =>
			url.startsWith('/Domain/')
				? Promise.resolve({ data: [domainA, domainC] })
				: Promise.resolve({
					data: {
						id: url.endsWith('clu-2') ? 'clu-2' : 'clu-1',
						organizationId: 'org-1',
						status: 'RUNNING',
						domainIds: url.endsWith('clu-2') ? [] : ['dom-a'],
					},
				})
		);
		put.mockRejectedValue(refused(instanceNotRunning));
		const rendered = renderManagement();
		await bindC(rendered);
		await rendered.findByText(shownForInstanceNotRunning);

		routeParams.clusterId = 'clu-2';
		rendered.rerenderPage();

		await waitFor(() => expect(get).toHaveBeenCalledWith('/Cluster/clu-2'));
		// The page suspends on the new cluster, and hides rather than unmounts what it showed.
		await waitFor(() => expect(rendered.queryByText('loading')).toBeNull());
		expect(rendered.queryByText(shownForInstanceNotRunning)).toBeNull();
	});

	it('sends nothing when the fresh domain list cannot be read, and says so', async () => {
		let listReads = 0;
		get.mockImplementation((url: string) => {
			if (!url.startsWith('/Domain/')) {
				return Promise.resolve({
					data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: ['dom-a'] },
				});
			}
			listReads += 1;
			return listReads === 1
				? Promise.resolve({ data: [domainA, domainC] })
				: Promise.reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK));
		});
		const rendered = renderManagement();

		await bindC(rendered);

		expect(await rendered.findByText("The domain change didn't go through: Network Error")).toBeTruthy();
		expect(put).not.toHaveBeenCalled();
		expect(toast.error).not.toHaveBeenCalled();
		expect(consoleError.mock.calls.filter(([logged]: unknown[]) => logged instanceof AxiosError)).toHaveLength(1);
	});
});

describe('DomainsManagement — the Remove Domain tooltip', () => {
	const boundTip = 'To delete this domain, please unbind it from all clusters first.';
	const unboundTip = 'Remember to clean up your DNS records!';

	async function renderRemove(clusterId: string | undefined) {
		const domain = { id: 'dom-a', domain: 'a.example.com', status: 'ACTIVE', organizationId: 'org-1', clusterId };
		get.mockImplementation((url: string) =>
			url.startsWith('/Domain/')
				? Promise.resolve({ data: [domain] })
				: Promise.resolve({
					data: { id: 'clu-1', organizationId: 'org-1', status: 'RUNNING', domainIds: clusterId ? ['dom-a'] : [] },
				})
		);
		const rendered = renderManagement();
		const name = await rendered.findByText('a.example.com');
		const cell = name.parentElement!;
		const remove = within(cell).getByRole('button', { name: 'Remove Domain' }) as HTMLButtonElement;
		// Radix marks its trigger with `data-state`, whichever element that turns out to be.
		const trigger = cell.querySelector<HTMLElement>('[data-state]')!;
		return { ...rendered, name, cell, remove, trigger };
	}

	async function expectDescribes(
		element: HTMLElement,
		tip: string,
		findByRole: (role: 'tooltip') => Promise<HTMLElement>,
	) {
		const tooltip = await findByRole('tooltip');
		expect(tooltip.textContent).toBe(tip);
		expect(element.getAttribute('aria-describedby')).toBe(tooltip.id);
	}

	it.each([
		{ state: 'bound', clusterId: 'clu-1', tip: boundTip },
		{ state: 'unbound', clusterId: undefined, tip: unboundTip },
	])('opens over a $state domain', async ({ clusterId, tip }) => {
		const { name, remove, trigger, findByRole, queryByRole } = await renderRemove(clusterId);
		expect(remove.disabled).toBe(!!clusterId);

		fireEvent.pointerMove(name);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(queryByRole('tooltip')).toBeNull();

		fireEvent.pointerMove(trigger);
		expect((await findByRole('tooltip')).textContent).toBe(tip);
	});

	it('describes a disabled Remove from a wrapper that keyboard focus can reach', async () => {
		const { remove, trigger, findByRole } = await renderRemove('clu-1');
		expect(trigger).not.toBe(remove);

		act(() => trigger.focus());

		expect(document.activeElement).toBe(trigger);
		await expectDescribes(trigger, boundTip, findByRole);
	});

	it('describes an enabled Remove on the button itself, with no extra tab stop', async () => {
		const { cell, remove, findByRole } = await renderRemove(undefined);
		expect(cell.querySelectorAll('[tabindex]')).toHaveLength(0);

		act(() => remove.focus());

		expect(document.activeElement).toBe(remove);
		await expectDescribes(remove, unboundTip, findByRole);
	});

	it('adds no tab stop to an unbound domain while another domain change is in flight', async () => {
		put.mockReturnValue(new Promise(() => {}));
		const { cell, getByRole, getByText } = await renderRemove(undefined);
		fireEvent.click(within(cell.closest('tr')!).getByRole('checkbox'));

		fireEvent.click(getByRole('button', { name: /Bind 1 Domain/ }));

		// Re-queried: the row's cells re-render once the change is pending.
		const pendingCell = await waitFor(() => {
			const current = getByText('a.example.com').parentElement!;
			expect((within(current).getByRole('button', { name: 'Remove Domain' }) as HTMLButtonElement).disabled).toBe(true);
			return current;
		});
		expect(pendingCell.querySelectorAll('[tabindex]')).toHaveLength(0);
	});
});
