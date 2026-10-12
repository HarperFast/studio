/**
 * @vitest-environment jsdom
 */
import { InstanceDatabaseMap, InstanceTable } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseOverview } from './DatabaseOverview';

vi.mock('@tanstack/react-router', () => {
	const params = {};
	const navigate = () => undefined;
	return { useParams: () => params, useNavigate: () => navigate };
});

vi.mock('@/hooks/usePermissions', () => ({
	useInstanceBrowseManagePermission: () => false,
	useInstanceImportOperationsPermission: () => false,
}));

vi.mock('./TableRowContextMenu', () => ({
	TableRowContextMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// One answer per table, settled by the test.
const counts = vi.hoisted(() => ({
	answers: {} as Record<string, { resolve: (data: unknown) => void; reject: (error: unknown) => void }>,
}));

vi.mock('@/config/useInstanceClient', () => {
	const instanceClient = {
		post: (_url: string, body: { operation: string; table: string }) =>
			new Promise((resolve, reject) => {
				counts.answers[body.table] = {
					resolve: (data) => resolve({ data }),
					reject,
				};
			}),
	};
	const params = { entityId: 'instance-1', instanceClient, entityType: 'instance' };
	return { useInstanceClientIdParams: () => params };
});

// As the page's describe_all map carries them: skip_record_count, so no counts.
const table = (name: string, extra: Partial<InstanceTable>) => ({
	schema: 'zoo',
	name,
	audit: true,
	schema_defined: true,
	db_size: 65536,
	sources: [],
	table_size: 4096,
	db_audit_size: 4096,
	attributes: [{ attribute: 'id' }, { attribute: 'name' }],
	...extra,
} as InstanceTable);

const instanceDatabaseMap: InstanceDatabaseMap = {
	zoo: {
		cats: table('cats', { primary_key: 'id' }),
		dogs: table('dogs', { hash_attribute: 'dogId', attributes: [{ attribute: 'dogId' }] }),
		eels: table('eels', {}),
	},
};

afterEach(() => {
	cleanup();
	counts.answers = {};
});

function renderOverview() {
	return render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
			<DatabaseOverview instanceDatabaseMap={instanceDatabaseMap} databaseName="zoo" />
		</QueryClientProvider>,
	);
}

const recordsStatValue = () => screen.getByText('Records', { selector: 'div' }).nextElementSibling as HTMLElement;
const recordsStat = () => recordsStatValue().textContent;
const rowCells = (tableName: string) =>
	within(document.querySelector<HTMLElement>(`tr[data-table-name="${tableName}"]`)!)
		.getAllByRole('cell')
		.map((cell) => cell.textContent);

describe('DatabaseOverview record counts', () => {
	it('renders schema from the map at once, and backfills each table’s count', async () => {
		renderOverview();

		expect(recordsStat()).toBe('…');
		expect(rowCells('cats').slice(0, 5)).toEqual(['cats', '…', '4.1 KB', '2', 'id']);
		expect(rowCells('dogs').slice(0, 5)).toEqual(['dogs', '…', '4.1 KB', '1', 'dogId']);
		expect(rowCells('eels')[4]).toBe('—');

		await vi.waitFor(() => expect(Object.keys(counts.answers).sort()).toEqual(['cats', 'dogs', 'eels']));
		await act(async () => counts.answers.cats.resolve({ record_count: 1200 }));
		await vi.waitFor(() => expect(rowCells('cats')[1]).toBe('1,200'));
		expect(recordsStat()).toBe('…');

		await act(async () => counts.answers.dogs.resolve({ record_count: 250_000, estimated_record_range: [1, 2] }));
		await act(async () => counts.answers.eels.reject(new Error('Request failed with status code 500')));
		await vi.waitFor(() => expect(recordsStat()).toBe('≥251,200'));
		expect(rowCells('dogs')[1]).toBe('~250,000');
		expect(rowCells('eels')[1]).toBe('…');

		const total = within(recordsStatValue()).getByRole('button', { name: 'At least about 251,200 records' });
		// Radix opens the tooltip on focus (delayDuration is 0).
		fireEvent.focus(total);
		expect(screen.getAllByRole('tooltip')[0].textContent).toBe(
			'One or more tables’ counts couldn’t be loaded and are left out, and some counts are estimates.',
		);
	});

	it('marks a total of settled counts ~ when one is an estimate, and explains it', async () => {
		renderOverview();
		await vi.waitFor(() => expect(Object.keys(counts.answers)).toHaveLength(3));
		await act(async () => {
			counts.answers.cats.resolve({ record_count: 1200 });
			counts.answers.dogs.resolve({ record_count: 250_000, estimated_record_range: [1, 2] });
			counts.answers.eels.resolve({ record_count: 34 });
		});

		await vi.waitFor(() => expect(recordsStat()).toBe('~251,234'));
		within(recordsStatValue()).getByRole('button', { name: 'Approximately 251,234 records (estimated)' });
	});

	it('shows an exact total plainly, with no marker to explain', async () => {
		renderOverview();
		await vi.waitFor(() => expect(Object.keys(counts.answers)).toHaveLength(3));
		await act(async () => {
			counts.answers.cats.resolve({ record_count: 1200 });
			counts.answers.dogs.resolve({ record_count: 30 });
			counts.answers.eels.resolve({ record_count: 4 });
		});

		await vi.waitFor(() => expect(recordsStat()).toBe('1,234'));
		expect(within(recordsStatValue()).queryByRole('button')).toBeNull();
	});
});
