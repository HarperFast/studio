/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: vi.fn() }) }));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ entityId: 'test-instance', entityType: 'instance' }),
}));
vi.mock('@/integrations/api/instance/database/createTable', () => ({
	useCreateTableMutation: () => ({ mutate: vi.fn() }),
}));

import { CreateNewTableModal } from './CreateNewTableModal';

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

afterEach(cleanup);

describe('CreateNewTableModal', () => {
	it('stops the table name, primary key and database name at the lengths the form accepts, and says so there', () => {
		render(
			<QueryClientProvider client={new QueryClient()}>
				<CreateNewTableModal isModalOpen setIsModalOpen={() => {}} databaseName={undefined} onCreated={() => {}} />
			</QueryClientProvider>,
		);
		const table = screen.getByLabelText('Table Name') as HTMLInputElement;
		const primaryKey = screen.getByLabelText('Primary Key') as HTMLInputElement;
		const database = screen.getByLabelText('Database Name') as HTMLInputElement;
		expect(table.maxLength).toBe(250);
		expect(primaryKey.maxLength).toBe(250);
		expect(database.maxLength).toBe(75);

		fireEvent.change(table, { target: { value: 't'.repeat(250) } });
		fireEvent.change(primaryKey, { target: { value: 'k'.repeat(250) } });
		fireEvent.change(database, { target: { value: 'd'.repeat(75) } });
		expect(screen.getAllByText('Maximum 250 characters reached.')).toHaveLength(2);
		expect(screen.getByText('Maximum 75 characters reached.')).toBeTruthy();
	});
});
