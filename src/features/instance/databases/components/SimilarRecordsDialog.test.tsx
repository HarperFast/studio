/** @vitest-environment jsdom */
import { nativeSelectStub } from '@/components/ui/__tests__/nativeSelectStub';
import { vectorAttributes } from '@/features/instance/databases/functions/vectorAttributes';
import { InstanceTable } from '@/integrations/api/api.patch';
import { mutationErrorHandler, queryErrorHandler } from '@/react-query/queryClient';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
	const params = { entityId: 'instance-1', instanceClient };
	return { useInstanceClientIdParams: () => params };
});

import { SimilarRecordsDialog, VectorSearchRequest } from './SimilarRecordsDialog';

const DOC = {
	schema: 'vec',
	name: 'Doc',
	primary_key: 'id',
	attributes: [
		{ attribute: 'id', type: 'ID', is_primary_key: true },
		{ attribute: 'embedding', type: 'array', elements: 'Float', indexed: { type: 'HNSW', distance: 'cosine' } },
		{
			attribute: 'titleVector',
			type: 'array',
			elements: 'Float',
			indexed: { type: 'HNSW', distance: 'euclidean' },
			embed: { source: 'title' },
		},
		{ attribute: 'title', type: 'String' },
	],
} as InstanceTable;

const SEED = {
	key: 'a',
	vectors: new Map([['embedding', [1, 0, 0, 0]], ['titleVector', [0, 1]]]),
};

/** What a real Harper 5.4.1 answered for the nearest records to `a`, which comes back first. */
const HITS = [
	{ $distance: 0, id: 'a', title: 'cat' },
	{ $distance: 0.006116265326381098, id: 'b', title: 'kitten' },
	{ $distance: 1, id: 'c', title: 'car' },
];

function refusal(status: number, error: string) {
	// The body names the operation, which is what tells a refused read from a write of unknown outcome.
	const config = {
		headers: new AxiosHeaders(),
		method: 'post',
		data: JSON.stringify({ operation: 'search_by_value' }),
	} as InternalAxiosRequestConfig;
	return new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_RESPONSE, config, undefined, {
		status,
		statusText: '',
		headers: {},
		config,
		data: { error },
	});
}

function renderRequest(request: VectorSearchRequest | undefined, table: InstanceTable = DOC) {
	const client = new QueryClient({
		queryCache: new QueryCache({ onError: queryErrorHandler }),
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
	});
	const view = (shown: VectorSearchRequest | undefined, described: InstanceTable) => (
		<QueryClientProvider client={client}>
			<SimilarRecordsDialog
				request={shown}
				onClose={vi.fn()}
				databaseName="vec"
				tableName="Doc"
				table={described}
				primaryKey="id"
				vectors={vectorAttributes(described)}
			/>
		</QueryClientProvider>
	);
	const { rerender } = render(view(request, table));
	return {
		rerender: (next: VectorSearchRequest | undefined, described: InstanceTable = table) =>
			rerender(view(next, described)),
	};
}

function renderDialog({ seed }: { seed: typeof SEED | undefined } = { seed: SEED }) {
	const { rerender } = renderRequest(seed && { kind: 'record', seed });
	return { rerender: (next: typeof SEED) => rerender({ kind: 'record', seed: next }) };
}

const searches = () => server.requests.filter(request => request.operation === 'search_by_value');
const results = () => within(screen.getByRole('region', { name: 'Results' })).getAllByRole('listitem');

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => {};
	Element.prototype.releasePointerCapture ??= () => {};
	Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
	server.requests = [];
	server.answer = () => HITS;
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('SimilarRecordsDialog', () => {
	it('searches from the record’s stored vector at once, and lists the others nearest first', async () => {
		renderDialog();
		await screen.findByRole('region', { name: 'Results' });
		expect(searches()).toEqual([{
			operation: 'search_by_value',
			database: 'vec',
			table: 'Doc',
			search_attribute: 'id',
			search_value: '*',
			get_attributes: ['$distance', 'id', 'title'],
			sort: { attribute: 'embedding', target: [1, 0, 0, 0] },
			limit: 21,
		}]);
		expect(results().map(item => item.textContent)).toEqual([
			expect.stringMatching(/^#1bdistance 0\.006116titlekitten$/),
			expect.stringMatching(/^#2cdistance 1titlecar$/),
		]);
		expect(screen.getByText(/using cosine distance: lower is closer/)).toBeTruthy();
	});

	it('shows no more than asked for when the record itself isn’t among the hits', async () => {
		server.answer = body =>
			Array.from({ length: Number(body.limit) }, (_, index) => ({ $distance: index, id: `r${index}`, title: 't' }));
		renderDialog();
		await screen.findByRole('region', { name: 'Results' });
		expect(results()).toHaveLength(20);
		expect(screen.getByText(/The 20 nearest records, nearest first. There may be more./)).toBeTruthy();
	});

	it('searches again by another vector, without showing the last one’s results under it', async () => {
		let release = () => {};
		renderDialog();
		await screen.findByRole('region', { name: 'Results' });
		server.answer = () =>
			new Promise(resolve => (release = () => resolve([{ $distance: 2.5, id: 'd', title: 'dog' }])));
		await act(async () => {
			fireEvent.change(screen.getByLabelText('Vector'), { target: { value: 'titleVector' } });
		});
		expect(screen.queryByRole('region', { name: 'Results' })).toBeNull();
		expect(await screen.findByText('Searching…')).toBeTruthy();
		await act(async () => release());
		await screen.findByText('dog');
		expect(searches().at(-1)).toMatchObject({
			sort: { attribute: 'titleVector', target: [0, 1] },
			get_attributes: ['$distance', 'id', 'title'],
		});
		expect(results().map(item => item.textContent)).toEqual([expect.stringContaining('dog')]);
		expect(screen.getByText(/using euclidean distance/)).toBeTruthy();
	});

	it('searches afresh for another record, without showing the first one’s results under it', async () => {
		const { rerender } = renderDialog();
		await screen.findByRole('region', { name: 'Results' });
		server.answer = () => [{ $distance: 0.3, id: 'a', title: 'cat' }];
		await act(async () => {
			rerender({ key: 'c', vectors: new Map([['embedding', [0, 0, 1, 0]]]) });
		});
		expect(await screen.findByText('distance 0.3')).toBeTruthy();
		expect(screen.queryByText('kitten')).toBeNull();
		expect(searches().at(-1)).toMatchObject({ sort: { attribute: 'embedding', target: [0, 0, 1, 0] } });
		expect(screen.getByText('c', { selector: 'code' })).toBeTruthy();
	});

	it('offers only the vectors the record has', async () => {
		renderDialog({ seed: { key: 'a', vectors: new Map([['titleVector', [0, 1]]]) } });
		await screen.findByRole('region', { name: 'Results' });
		expect(screen.queryByLabelText('Vector')).toBeNull();
		expect(searches()[0]).toMatchObject({ sort: { attribute: 'titleVector', target: [0, 1] } });
	});

	it('shows Harper’s refusal inline, with no toast and no error report', async () => {
		const toastError = vi.spyOn(toast, 'error');
		const consoleError = vi.spyOn(console, 'error');
		vi.spyOn(console, 'debug').mockImplementation(() => {});
		server.answer = () => {
			throw refusal(400, 'A target vector must be provided for an HNSW query');
		};
		renderDialog();
		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('Harper refused the search');
		expect(alert.textContent).toContain('A target vector must be provided for an HNSW query');
		expect(toastError).not.toHaveBeenCalled();
		expect(consoleError).not.toHaveBeenCalled();
	});

	it('says so when no other record has the vector, and shows an unreadable distance as unknown', async () => {
		server.answer = () => [HITS[0]];
		renderDialog();
		expect(await screen.findByText('No other record has this vector.')).toBeTruthy();

		cleanup();
		server.answer = () => [{ id: 'x', title: 'y'.repeat(500) }];
		renderDialog();
		await screen.findByRole('region', { name: 'Results' });
		const [only] = results();
		expect(only.textContent).toContain('distance unknown');
		expect(only.textContent).toContain(`${'y'.repeat(200)}…`);
		expect(only.textContent).not.toContain('y'.repeat(201));
	});

	it('stays closed, and searches nothing, without a request', async () => {
		renderDialog({ seed: undefined });
		await act(async () => {});
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(searches()).toEqual([]);
	});
});

describe('SimilarRecordsDialog searching by text', () => {
	/** Two `@embed` fields, one naming its model, beside a vector `@embed` doesn't fill. */
	const ARTICLE = {
		schema: 'vec',
		name: 'Article',
		primary_key: 'id',
		attributes: [
			{ attribute: 'id', type: 'ID', is_primary_key: true },
			{ attribute: 'raw', type: 'array', elements: 'Float', indexed: { type: 'HNSW' } },
			{
				attribute: 'embedding',
				type: 'array',
				elements: 'Float',
				indexed: { type: 'HNSW', distance: 'cosine' },
				embed: { source: 'title', model: 'default' },
			},
			{
				attribute: 'bodyVector',
				type: 'array',
				elements: 'Float',
				indexed: { type: 'HNSW', distance: 'euclidean' },
				embed: { source: 'body' },
			},
			{ attribute: 'title', type: 'String' },
			{ attribute: 'body', type: 'String' },
		],
	} as InstanceTable;

	/** What a build of harper main (#4498) answered for “my kitten keeps purring”. */
	const TEXT_HITS = [
		{ $distance: 0.0298, id: 'cats-1', title: 'Why cats knead blankets' },
		{ $distance: 0.0370, id: 'cats-2', title: 'Kitten care basics' },
	];

	const openTextSearch = () => renderRequest({ kind: 'text' }, ARTICLE);
	const type = (text: string) => fireEvent.change(screen.getByLabelText('Text'), { target: { value: text } });
	const submit = () => fireEvent.click(screen.getByRole('button', { name: /Search/ }));

	beforeEach(() => {
		server.answer = () => TEXT_HITS;
	});

	it('runs no search, and so calls no model, until a submit', async () => {
		openTextSearch();
		type('my kitten keeps purring');
		fireEvent.change(screen.getByLabelText('Vector'), { target: { value: 'bodyVector' } });
		fireEvent.change(screen.getByLabelText('Show up to'), { target: { value: '50' } });
		await act(async () => {});
		expect(searches()).toEqual([]);
	});

	it('offers only the fields @embed fills, and searches the chosen one by the trimmed text', async () => {
		openTextSearch();
		const options = within(screen.getByLabelText('Vector')).getAllByRole('option').map(option => option.textContent);
		expect(options.filter(Boolean)).toEqual(['embedding', 'bodyVector']);
		type('  my kitten keeps purring  ');
		await act(async () => submit());
		await screen.findByRole('region', { name: 'Results' });
		expect(searches()).toEqual([{
			operation: 'search_by_value',
			database: 'vec',
			table: 'Doc',
			search_attribute: 'id',
			search_value: '*',
			get_attributes: ['$distance', 'id', 'title', 'body'],
			sort: { attribute: 'embedding', text: 'my kitten keeps purring' },
			limit: 20,
		}]);
		expect(results().map(item => item.textContent)).toEqual([
			expect.stringContaining('cats-1'),
			expect.stringContaining('cats-2'),
		]);
	});

	it('names the model, or says it is the field’s own when describe gives no name', () => {
		openTextSearch();
		expect(screen.getByText(/as a search query/).textContent).toContain('the default model');
		fireEvent.change(screen.getByLabelText('Vector'), { target: { value: 'bodyVector' } });
		expect(screen.getByText(/as a search query/).textContent).toContain('bodyVector’s @embed model');
	});

	it('won’t submit blank text, and sends one search for a double submit', async () => {
		let release = () => {};
		server.answer = () => new Promise(resolve => (release = () => resolve(TEXT_HITS)));
		openTextSearch();
		type('   ');
		expect((screen.getByRole('button', { name: /Search/ }) as HTMLButtonElement).disabled).toBe(true);
		await act(async () => fireEvent.submit(screen.getByLabelText('Text').closest('form')!));
		expect(searches()).toEqual([]);

		type('kitten');
		const form = screen.getByLabelText('Text').closest('form')!;
		await act(async () => {
			fireEvent.submit(form);
			fireEvent.submit(form);
		});
		await act(async () => release());
		expect(searches()).toHaveLength(1);
	});

	it('keeps a search running across closing and reopening, and starts no second one meanwhile', async () => {
		let release = () => {};
		server.answer = () => new Promise(resolve => (release = () => resolve(TEXT_HITS)));
		const { rerender } = openTextSearch();
		type('kitten');
		await act(async () => submit());
		await act(async () => rerender(undefined));
		await act(async () => rerender({ kind: 'text' }));
		expect(screen.getByText('Searching…')).toBeTruthy();
		type('puppy');
		await act(async () => fireEvent.submit(screen.getByLabelText('Text').closest('form')!));
		await act(async () => release());
		expect(searches()).toHaveLength(1);
		expect(await screen.findByRole('region', { name: 'Results' })).toBeTruthy();
	});

	it('holds the field while a search runs, so its results are never shown under another', async () => {
		let release = () => {};
		server.answer = () => new Promise(resolve => (release = () => resolve(TEXT_HITS)));
		openTextSearch();
		type('kitten');
		await act(async () => submit());
		const field = () => screen.getByLabelText('Vector') as HTMLSelectElement;
		await vi.waitFor(() => expect(field().disabled).toBe(true));
		await act(async () => release());
		await vi.waitFor(() => expect(field().disabled).toBe(false));
	});

	it('hides its results once a schema refresh changes the searched field’s model', async () => {
		const { rerender } = openTextSearch();
		type('kitten');
		await act(async () => submit());
		await screen.findByRole('region', { name: 'Results' });
		const remodelled = {
			...ARTICLE,
			attributes: ARTICLE.attributes.map(attribute =>
				attribute.attribute === 'embedding' ? { ...attribute, embed: { source: 'title', model: 'bigger' } } : attribute
			),
		} as InstanceTable;
		await act(async () => rerender({ kind: 'text' }, remodelled));
		expect(screen.queryByRole('region', { name: 'Results' })).toBeNull();
		expect(screen.getByText(/as a search query/).textContent).toContain('the bigger model');
	});

	it('says the results are for the last search once the text changes, and drops them for another field', async () => {
		openTextSearch();
		type('kitten');
		await act(async () => submit());
		await screen.findByRole('region', { name: 'Results' });
		type('puppy');
		expect(screen.getByText(/These are for your last search/)).toBeTruthy();
		fireEvent.change(screen.getByLabelText('Vector'), { target: { value: 'bodyVector' } });
		expect(screen.queryByRole('region', { name: 'Results' })).toBeNull();
	});

	it('shows Harper’s refusal inline, such as a model that failed', async () => {
		vi.spyOn(console, 'debug').mockImplementation(() => {});
		const toastError = vi.spyOn(toast, 'error');
		server.answer = () => {
			throw refusal(502, 'Embedding the sort text for "embedding" failed');
		};
		openTextSearch();
		type('kitten');
		await act(async () => submit());
		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('Harper refused the search');
		expect(alert.textContent).toContain('Embedding the sort text for "embedding" failed');
		expect(toastError).not.toHaveBeenCalled();
	});
});
