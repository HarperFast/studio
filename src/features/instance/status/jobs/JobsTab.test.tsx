// @vitest-environment jsdom
import type { LocalRolePermission } from '@/integrations/api/api.patch';
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobsTab, MAX_RENDERED_JOBS } from './JobsTab';

const permission = vi.hoisted(() => ({ current: undefined as LocalRolePermission | undefined }));
const navigateMock = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('@/hooks/useAuth', () => ({
	useInstanceAuth: () => ({ user: permission.current ? { role: { permission: permission.current } } : null }),
}));

vi.mock('@tanstack/react-router', () => ({
	useSearch: () => search.current,
	useNavigate: () => navigateMock,
}));

const superUser = { super_user: true } as unknown as LocalRolePermission;

function renderTab(
	post: (url: string, body: Record<string, unknown>) => Promise<unknown>,
	entityType: 'instance' | 'cluster' = 'instance',
) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
	const instanceParams = { instanceClient: { post } as never, entityId: 'ins-1' as never, entityType };
	render(
		<QueryClientProvider client={client}>
			<JobsTab instanceParams={instanceParams} />
		</QueryClientProvider>,
	);
}

function forbidden(): AxiosError {
	const err = new AxiosError('Request failed with status code 403');
	err.response = { status: 403 } as AxiosError['response'];
	return err;
}

beforeAll(() => {
	// Radix Select relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
	search.current = { tab: 'jobs', range: '24h' };
});

afterEach(() => {
	cleanup();
	permission.current = undefined;
	navigateMock.mockClear();
});

describe('JobsTab', () => {
	it('lists the jobs Harper returns, newest first', async () => {
		permission.current = superUser;
		renderTab(async () => ({
			data: [
				{ id: 'job-old', type: 'csv_url_load', status: 'COMPLETE', start_datetime: 1_000, end_datetime: 13_000 },
				{ id: 'job-new', type: 'export_local', status: 'IN_PROGRESS', start_datetime: 50_000, user: 'admin' },
			],
		}));

		const rows = await screen.findAllByRole('row');
		expect(rows).toHaveLength(3);
		expect(within(rows[1]).getByText('export_local')).toBeTruthy();
		expect(within(rows[1]).getByText('Running')).toBeTruthy();
		expect(within(rows[2]).getByText('csv_url_load')).toBeTruthy();
		expect(within(rows[2]).getByText('Complete')).toBeTruthy();
		expect(within(rows[2]).getByText('12s')).toBeTruthy();
	});

	it('expands a row to show the full record, rendering a structured message as text', async () => {
		permission.current = superUser;
		const report = { error: 'not authorized', unauthorized_access: [{ table: 'dog' }] };
		renderTab(async () => ({
			data: [{ id: 'job-1', type: 'csv_data_load', status: 'ERROR', message: report, result: { inserted: 0 } }],
		}));

		const toggle = await screen.findByRole('button', { name: 'Show details for job job-1' });
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		fireEvent.click(toggle);

		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		const details = document.getElementById(toggle.getAttribute('aria-controls')!)!;
		expect(within(details).getByText(JSON.stringify(report))).toBeTruthy();
		expect(within(details).getByText(/"inserted": 0/)).toBeTruthy();
		expect(screen.queryByText('[object Object]')).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Hide details for job job-1' }));
		expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBeNull();
	});

	it('leaves a row as it is when a click ends a text selection inside it', async () => {
		permission.current = superUser;
		renderTab(async () => ({ data: [{ id: 'job-1', type: 'csv_data_load', status: 'COMPLETE', user: 'admin' }] }));

		const toggle = await screen.findByRole('button', { name: 'Show details for job job-1' });
		const row = toggle.closest('tr')!;
		const select = (node: Node) => {
			const range = document.createRange();
			range.selectNodeContents(node);
			window.getSelection()!.removeAllRanges();
			window.getSelection()!.addRange(range);
		};

		select(within(row).getByText('admin'));
		fireEvent.click(row);
		expect(toggle.getAttribute('aria-expanded')).toBe('false');

		// A selection elsewhere on the page is not this row's drag, so the click still toggles.
		select(screen.getByText('Jobs'));
		fireEvent.click(row);
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		window.getSelection()!.removeAllRanges();
	});

	it('never asks Harper when the role certainly cannot list jobs', () => {
		permission.current = { super_user: false } as unknown as LocalRolePermission;
		const post = vi.fn(async () => ({ data: [] }));
		renderTab(post);

		expect(screen.getByText("Your role can't list jobs on this instance.")).toBeTruthy();
		expect(screen.queryByRole('group', { name: 'Auto-refresh' })).toBeNull();
		expect(post).not.toHaveBeenCalled();
	});

	describe('a role whose operations allowlist lists search_jobs_by_start_date', () => {
		const listing = { operations: ['read_only', 'search_jobs_by_start_date'] } as unknown as LocalRolePermission;

		function answer(version: string | Error) {
			return vi.fn(async (_url: string, body: Record<string, unknown>) => {
				if (body.operation === 'registration_info') {
					if (version instanceof Error) {
						throw version;
					}
					return { data: { version } };
				}
				return { data: [{ id: 'job-1', type: 'csv_url_load', status: 'COMPLETE', start_datetime: 1_000 }] };
			});
		}

		const searched = (post: ReturnType<typeof answer>) =>
			post.mock.calls.filter(([, body]) => body.operation === 'search_jobs_by_start_date');

		it('lists jobs on Harper 5.3, which honours the grant', async () => {
			permission.current = listing;
			const post = answer('5.3.2');
			renderTab(post);

			expect(await screen.findByText('csv_url_load')).toBeTruthy();
			expect(searched(post)).toHaveLength(1);
		});

		it('explains, without asking for jobs, on a version that ignores the grant', async () => {
			permission.current = listing;
			const post = answer('5.2.9');
			renderTab(post);

			expect(await screen.findByText("Your role can't list jobs on this instance.")).toBeTruthy();
			expect(searched(post)).toHaveLength(0);
		});

		it('tries the grant when reading the version fails', async () => {
			permission.current = listing;
			const post = answer(forbidden());
			renderTab(post);

			expect(await screen.findByText('csv_url_load')).toBeTruthy();
		});
	});

	it('waits for the role to load before asking Harper', () => {
		const post = vi.fn(async () => ({ data: [] }));
		renderTab(post);

		expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
		expect(post).not.toHaveBeenCalled();
	});

	it('explains a 403 instead of offering a retry that cannot succeed', async () => {
		permission.current = superUser;
		renderTab(async () => {
			throw forbidden();
		});

		expect(await screen.findByText("Your role can't list jobs on this instance.")).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
	});

	it('says so when no jobs started in the window', async () => {
		permission.current = superUser;
		renderTab(async () => ({ data: [] }));

		expect(await screen.findByText('No jobs started in the selected time range.')).toBeTruthy();
	});

	it('renders at most the most recent jobs of a long window, and says how many there were', async () => {
		permission.current = superUser;
		const total = MAX_RENDERED_JOBS + 5;
		renderTab(async () => ({
			data: Array.from({ length: total }, (_, i) => ({ id: `job-${i}`, status: 'COMPLETE', start_datetime: i })),
		}));

		await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(MAX_RENDERED_JOBS + 1));
		expect(screen.getByText(`Showing the ${MAX_RENDERED_JOBS} most recent of ${total} jobs in this range.`))
			.toBeTruthy();
		expect(screen.getByRole('button', { name: `Show details for job job-${total - 1}` })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Show details for job job-0' })).toBeNull();
	});

	it('tells a cluster view that job records are per node', async () => {
		permission.current = superUser;
		renderTab(async () => ({ data: [] }), 'cluster');

		expect(await screen.findByText(/Job records stay on the node that ran them/)).toBeTruthy();
	});

	it('reads a window wider than 7 days as 7 days, since every poll fetches the whole window', async () => {
		permission.current = superUser;
		search.current = { tab: 'jobs', range: '30d' };
		const post = vi.fn(async (_url: string, _body: Record<string, unknown>) => ({ data: [] }));
		renderTab(post);
		await screen.findByText('No jobs started in the selected time range.');

		const { from_date, to_date } = post.mock.calls[0][1] as { from_date: string; to_date: string };
		const spanMs = Date.parse(to_date) - Date.parse(from_date);
		expect(spanMs).toBe(7 * 24 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000);
		expect(screen.getByRole('combobox', { name: 'Jobs started within' }).textContent).toBe('Last 7 days');
	});

	it('refetches on demand', async () => {
		permission.current = superUser;
		const post = vi.fn(async () => ({ data: [] }));
		renderTab(post);
		await screen.findByText('No jobs started in the selected time range.');
		expect(post).toHaveBeenCalledTimes(1);

		fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
		await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
	});

	describe('auto-refresh', () => {
		const interval = () => screen.getByRole('combobox', { name: 'Auto-refresh interval' });

		beforeEach(() => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
		});

		afterEach(() => {
			vi.useRealTimers();
			focusManager.setFocused(undefined);
			onlineManager.setOnline(true);
		});

		async function openWith(searchParams: Record<string, unknown>) {
			permission.current = superUser;
			search.current = { tab: 'jobs', range: '24h', ...searchParams };
			const post = vi.fn(async () => ({ data: [] }));
			renderTab(post);
			await screen.findByText('No jobs started in the selected time range.');
			return post;
		}

		async function wait(ms: number) {
			await act(async () => {
				await vi.advanceTimersByTimeAsync(ms);
			});
		}

		it('fetches once when Jobs opens and then only when asked', async () => {
			const post = await openWith({});
			expect(interval().textContent).toBe('Off');

			await wait(10 * 60_000);
			// Long past staleTime, so a refocus or reconnect would refetch if either were allowed to.
			act(() => {
				focusManager.setFocused(false);
				focusManager.setFocused(true);
				onlineManager.setOnline(false);
				onlineManager.setOnline(true);
			});
			await wait(0);
			expect(post).toHaveBeenCalledTimes(1);
		});

		it("does not poll on the charts' auto-refresh interval", async () => {
			const post = await openWith({ refresh: 30_000 });
			expect(interval().textContent).toBe('Off');

			await wait(10 * 60_000);
			expect(post).toHaveBeenCalledTimes(1);
		});

		it('polls on an interval chosen for Jobs', async () => {
			const post = await openWith({ refresh: 0, jobsRefresh: 30_000 });
			expect(interval().textContent).toBe('30s');

			await wait(30_000);
			await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
		});

		it("records a picked interval as Jobs' own, leaving the charts' interval as it was", async () => {
			await openWith({ refresh: 300_000 });

			fireEvent.pointerDown(interval(), { button: 0, ctrlKey: false, pointerType: 'mouse' });
			fireEvent.click(await screen.findByRole('option', { name: '30s' }));

			expect(navigateMock).toHaveBeenLastCalledWith({
				to: '.',
				search: { tab: 'jobs', range: '24h', refresh: 300_000, jobsRefresh: 30_000 },
			});
		});
	});
});
