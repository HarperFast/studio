/**
 * @vitest-environment jsdom
 */
import { SectionsContent } from '@/features/instance/extensions/content/SectionsContent';
import type { ExtensionDataSource, ExtensionRecord } from '@/features/instance/extensions/dataSource';
import type { TableSection } from '@/features/instance/extensions/manifest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/SimpleBrowseDataTable', () => ({
	SimpleBrowseDataTable: ({ data, onRowClick, children }: {
		data: ExtensionRecord[];
		onRowClick?: (row: { original: ExtensionRecord }) => void;
		children: React.ReactNode;
	}) => (
		<div>
			{children}
			{data.map((record) => (
				<button
					key={String(record.id)}
					type="button"
					onClick={() => onRowClick?.({ original: record })}
				>
					row {String(record.id)}
				</button>
			))}
		</div>
	),
}));

afterEach(cleanup);

const section: TableSection = {
	type: 'table',
	database: 'redirects',
	table: 'Rule',
	itemName: 'rule',
	columns: [{ attribute: 'source', label: 'Source' }],
	fields: [{ attribute: 'source', label: 'Source', input: 'text', required: true }],
};

function renderTable() {
	const dataSource: ExtensionDataSource = {
		id: 'test',
		list: vi.fn(async () => ({ records: [{ id: 'r1', source: '/old', hits: 9 }], truncated: false })),
		count: vi.fn(),
		get: vi.fn(),
		insert: vi.fn(async () => undefined),
		update: vi.fn(async () => undefined),
		remove: vi.fn(),
		send: vi.fn(),
	};
	render(
		<QueryClientProvider client={new QueryClient()}>
			<SectionsContent
				sections={[section]}
				dataSource={dataSource}
				permission={{ super_user: true }}
				access={undefined}
			/>
		</QueryClientProvider>,
	);
	return dataSource;
}

function save(source: string) {
	fireEvent.change(screen.getByLabelText(/Source/), { target: { value: source } });
	fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

describe('SectionsContent table', () => {
	it('adds with insert, so a taken key fails instead of overwriting that row', async () => {
		const dataSource = renderTable();
		fireEvent.click(await screen.findByRole('button', { name: /Add rule/i }));
		save('/new');
		await waitFor(() => expect(dataSource.insert).toHaveBeenCalledWith('redirects', 'Rule', { source: '/new' }));
		expect(dataSource.update).not.toHaveBeenCalled();
	});

	it("edits with update, writing only the form's fields and the key", async () => {
		const dataSource = renderTable();
		fireEvent.click(await screen.findByRole('button', { name: 'row r1' }));
		save('/changed');
		await waitFor(() =>
			expect(dataSource.update).toHaveBeenCalledWith('redirects', 'Rule', { id: 'r1', source: '/changed' })
		);
		expect(dataSource.insert).not.toHaveBeenCalled();
	});
});
