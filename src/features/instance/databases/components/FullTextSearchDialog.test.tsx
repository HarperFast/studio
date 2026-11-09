/** @vitest-environment jsdom */
import { nativeSelectStub } from '@/components/ui/__tests__/nativeSelectStub';
import { FullTextIndexDescription } from '@/integrations/api/api.patch';
import { mutationErrorHandler, queryErrorHandler } from '@/react-query/queryClient';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
	requests: [] as Array<Record<string, unknown>>,
	answer: undefined as undefined | ((body: Record<string, unknown>) => unknown),
}));

vi.mock('@/components/ui/select', () => nativeSelectStub);
vi.mock('@/config/useInstanceClient', () => {
	const instanceClient = {
		post: async (_url: string, body: Record<string, unknown>) => {
			server.requests.push(body);
			return { data: await server.answer!(body) };
		},
	} as unknown as AxiosInstance;
	const params = { entityId: 'cluster-1', instanceClient };
	return { useInstanceClientIdParams: () => params };
});

import { FullTextSearchDialog } from './FullTextSearchDialog';

/** `describe_table`'s entry from a real Harper 5.3.6, for the docs' Product table. */
const INDEX: FullTextIndexDescription = {
	name: 'catalogSearch',
	fields: [
		{ name: 'title', weight: 3, highlight: true },
		{ name: 'description', weight: 1, highlight: true },
		{ name: 'tags', weight: 1 },
	],
	analyzer: 'english@2',
	stop_words: true,
	positions: true,
	surface_terms: true,
	synonyms: [],
	highlighting: { maxFragments: 2, fragmentLength: 60 },
	query_modes: ['any', 'all', 'fuzzy', 'phrase', 'prefix', 'fuzzy-prefix'],
	readiness: { state: 'ready', owner_epoch: '2', rebuild_attempts: 0 },
};

/** Two hits as Harper 5.3.6 answered `matches` "waterproof trail". */
const HITS = [
	{
		id: 'shoe-1',
		title: 'Waterproof trail running shoes',
		description: 'Grippy outsole.',
		tags: ['footwear', 'trail'],
		$score: 4.378283,
		$highlights: {
			title: [{
				valueIndex: 0,
				spans: [{ start: 0, end: 10 }, { start: 11, end: 16 }],
				fragments: [{
					text: 'Waterproof trail running shoes',
					start: 0,
					spans: [{ start: 0, end: 10 }, { start: 11, end: 16 }],
				}],
			}],
		},
	},
	{ id: 'mix', title: 'Trail mix', description: 'Snacks.', tags: ['snack'], $score: 1.2 },
];

/** Harper answering `status`, with the request it answered, as axios reports it. */
function refusal(status: number, error: string, body: Record<string, unknown>) {
	const config = {
		headers: new AxiosHeaders(),
		method: 'post',
		data: JSON.stringify(body),
	} as InternalAxiosRequestConfig;
	return new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_RESPONSE, config, undefined, {
		status,
		statusText: '',
		headers: {},
		config,
		data: { error },
	});
}

function renderDialog(overrides: Partial<Parameters<typeof FullTextSearchDialog>[0]> = {}) {
	// Routes failures the way the app does, so a toast that shouldn't happen would.
	const client = new QueryClient({
		queryCache: new QueryCache({ onError: queryErrorHandler }),
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
	});
	const onRefresh = vi.fn();
	render(
		<QueryClientProvider client={client}>
			<FullTextSearchDialog
				open
				onOpenChange={vi.fn()}
				databaseName="data"
				tableName="Product"
				primaryKey="id"
				indexes={[INDEX]}
				isCluster={false}
				isRefreshing={false}
				onRefresh={onRefresh}
				{...overrides}
			/>
		</QueryClientProvider>,
	);
	return { onRefresh };
}

async function search(query: string) {
	fireEvent.change(screen.getByLabelText('Query'), { target: { value: query } });
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name: /Search/ }));
	});
}

const searches = () => server.requests.filter(request => request.operation === 'search_by_conditions');

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => {};
	Element.prototype.releasePointerCapture ??= () => {};
	Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
	server.requests = [];
	server.answer = body => {
		if (body.operation === 'cluster_status') {
			return { node_name: 'node-a.example.com', is_enabled: true, connections: [] };
		}
		return HITS;
	};
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('FullTextSearchDialog readiness', () => {
	it('shows the index is ready, and doesn’t name a node for a single instance', () => {
		renderDialog();
		const readiness = screen.getByRole('region', { name: 'Index readiness' });
		expect(within(readiness).getByText('Ready')).toBeTruthy();
		expect(within(readiness).queryByText(/As reported by/)).toBeNull();
		expect(server.requests.some(request => request.operation === 'cluster_status')).toBe(false);
	});

	it('on a cluster, names the node it heard from, since each node has its own index', async () => {
		renderDialog({ isCluster: true });
		expect(await screen.findByText('node-a.example.com')).toBeTruthy();
		expect(screen.getByText(/another node’s can differ/)).toBeTruthy();
	});

	it('on a cluster that can’t say which node answered, says so without an error', async () => {
		const toastError = vi.spyOn(toast, 'error');
		server.answer = body => {
			if (body.operation === 'cluster_status') {
				throw refusal(400, "Operation 'cluster_status' not found", body);
			}
			return HITS;
		};
		renderDialog({ isCluster: true });
		expect(await screen.findByText(/As reported by the node that answered/)).toBeTruthy();
		expect(toastError).not.toHaveBeenCalled();
	});

	it('warns that searches can fail while the index rebuilds, and checks again on request', () => {
		const { onRefresh } = renderDialog({
			indexes: [{ ...INDEX, readiness: { state: 'rebuilding', owner_epoch: '3', rebuild_attempts: 2 } }],
		});
		expect(screen.getByText('Rebuilding')).toBeTruthy();
		expect(screen.getByText(/Searches can fail until the index is ready. Rebuild attempts so far: 2./)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: /Check again/ }));
		expect(onRefresh).toHaveBeenCalledOnce();
	});
});

describe('FullTextSearchDialog search', () => {
	it('runs the query and shows each hit ranked, with its score and highlighted matches', async () => {
		renderDialog();
		await search('waterproof trail');
		expect(searches()).toEqual([{
			operation: 'search_by_conditions',
			database: 'data',
			table: 'Product',
			get_attributes: ['*', '$score', '$highlights'],
			conditions: [{
				attribute: 'catalogSearch',
				comparator: 'matches',
				value: 'waterproof trail',
				fields: ['title', 'description', 'tags'],
			}],
			limit: 20,
		}]);

		const results = await screen.findByRole('region', { name: 'Results' });
		const [first, second] = within(results).getAllByRole('listitem');
		expect(within(first).getByText('#1')).toBeTruthy();
		expect(within(first).getByText('shoe-1')).toBeTruthy();
		expect(within(first).getByText(/score 4\.378/)).toBeTruthy();
		expect([...first.querySelectorAll('mark')].map(mark => mark.textContent)).toEqual(['Waterproof', 'trail']);
		// A hit with nothing highlighted still shows what it matched in.
		expect(within(second).getByText('Trail mix')).toBeTruthy();
		expect(within(results).getByText('2 matches, best first.')).toBeTruthy();
	});

	it('searches only the chosen sources, in the chosen mode, waiting for recent writes when asked', async () => {
		renderDialog();
		fireEvent.change(screen.getByLabelText('Query mode'), { target: { value: 'matches_phrase' } });
		fireEvent.click(screen.getByRole('checkbox', { name: /description/ }));
		fireEvent.click(screen.getByRole('checkbox', { name: /tags/ }));
		fireEvent.click(screen.getByRole('switch', { name: /Wait for recent writes/ }));
		fireEvent.change(screen.getByLabelText('Show up to'), { target: { value: '50' } });
		await search('trail running');
		expect(searches()[0]).toMatchObject({
			conditions: [{
				attribute: 'catalogSearch',
				comparator: 'matches_phrase',
				value: 'trail running',
				fields: ['title'],
				maxIndexLagMilliseconds: 0,
				waitForIndexMilliseconds: 30_000,
			}],
			limit: 50,
		});
	});

	it('offers only the modes the index answers', () => {
		renderDialog({ indexes: [{ ...INDEX, query_modes: ['any', 'all', 'fuzzy'] }] });
		const modes = within(screen.getByLabelText('Query mode')).getAllByRole('option')
			.map(option => option.getAttribute('value'))
			.filter(Boolean);
		expect(modes).toEqual(['matches', 'matches_all', 'matches_fuzzy']);
	});

	it('doesn’t ask an index without highlighting for highlights', async () => {
		renderDialog({ indexes: [{ ...INDEX, highlighting: false }] });
		await search('trail');
		expect(searches()[0].get_attributes).toEqual(['*', '$score']);
	});

	it('shows Harper’s own message when it refuses a search, without a toast or an error report', async () => {
		const toastError = vi.spyOn(toast, 'error');
		const consoleError = vi.spyOn(console, 'error');
		vi.spyOn(console, 'debug').mockImplementation(() => {});
		server.answer = body => {
			throw refusal(503, "Full-text index 'catalogSearch' is not ready", body);
		};
		renderDialog();
		await search('trail');
		await waitFor(() => expect(screen.getByText('Harper refused the search')).toBeTruthy());
		expect(screen.getByText("Full-text index 'catalogSearch' is not ready")).toBeTruthy();
		expect(toastError).not.toHaveBeenCalled();
		expect(consoleError).not.toHaveBeenCalled();
	});

	it('says when nothing matches', async () => {
		server.answer = () => [];
		renderDialog();
		await search('zzz');
		expect(await screen.findByText('No records match.')).toBeTruthy();
	});
});

describe('FullTextSearchDialog request', () => {
	it('is sent once, so a refusal while the index rebuilds shows at once rather than after the gateway retries', async () => {
		const post = vi.fn(async () => ({ data: [] }));
		const { searchFullText } = await import('@/integrations/api/instance/database/searchFullText');
		await searchFullText({
			instanceClient: { post } as unknown as AxiosInstance,
			databaseName: 'data',
			tableName: 'Product',
			index: INDEX,
			comparator: 'matches',
			query: 'trail',
			fields: [],
			waitForRecentWrites: false,
			limit: 20,
		});
		expect(post).toHaveBeenCalledWith('/', expect.anything(), { skipGatewayRetry: true });
	});
});

describe('FullTextSearchDialog robustness', () => {
	it('works with an index and a source named like Object.prototype members', async () => {
		const odd: FullTextIndexDescription = {
			...INDEX,
			name: 'constructor',
			fields: [{ name: 'toString', weight: 1, highlight: true }, { name: 'valueOf', weight: 1 }],
		};
		server.answer = () => [{ id: 'r1', toString: 'trail shoes', $score: 1 }];
		renderDialog({ indexes: [odd] });
		fireEvent.click(screen.getByRole('checkbox', { name: /valueOf/ }));
		await search('trail');
		expect(searches()[0]).toMatchObject({ conditions: [{ attribute: 'constructor', fields: ['toString'] }] });
		expect(await screen.findByText('r1')).toBeTruthy();
	});

	it('clears the results of one index when another is chosen', async () => {
		const other: FullTextIndexDescription = { ...INDEX, name: 'tagSearch', fields: [{ name: 'tags', weight: 1 }] };
		renderDialog({ indexes: [INDEX, other] });
		await search('trail');
		expect(await screen.findByRole('region', { name: 'Results' })).toBeTruthy();
		await act(async () => {
			fireEvent.change(screen.getByLabelText('Index'), { target: { value: 'tagSearch' } });
		});
		expect(screen.queryByRole('region', { name: 'Results' })).toBeNull();
		expect(screen.getByRole('region', { name: 'Index readiness' }).textContent).toContain('tagSearch');
	});

	it('asks for the node name again with every readiness check', async () => {
		const { onRefresh } = renderDialog({ isCluster: true });
		await screen.findByText('node-a.example.com');
		server.answer = () => ({ node_name: 'node-b.example.com' });
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /Check again/ }));
		});
		expect(onRefresh).toHaveBeenCalledOnce();
		expect(await screen.findByText('node-b.example.com')).toBeTruthy();
	});

	it('keeps hits apart when the role can’t read the primary key', async () => {
		const consoleError = vi.spyOn(console, 'error');
		server.answer = () => [{ title: 'Trail one', $score: 2 }, { title: 'Trail two', $score: 1 }];
		renderDialog();
		await search('trail');
		const results = await screen.findByRole('region', { name: 'Results' });
		expect(within(results).getAllByRole('listitem')).toHaveLength(2);
		expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/same key/);
	});
});
