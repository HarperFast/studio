/**
 * @vitest-environment jsdom
 */
import { ImportDataModal } from '@/features/instance/databases/modals/ImportDataModal';
import type { ImportDataParams } from '@/integrations/api/instance/database/importData';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mutate = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({
	error: vi.fn(),
	loading: vi.fn(() => 'toast-1'),
	success: vi.fn(),
	dismiss: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ instanceId: 'instance-1' }),
}));

vi.mock('@/hooks/useAuth', () => ({
	useInstanceAuth: () => ({ user: { role: { permission: { super_user: true } } } }),
	isAdminMode: () => false,
	useCloudAuth: () => ({ user: null }),
}));

vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: {}, entityId: 'entity-1', entityType: 'instance' }),
}));

vi.mock('@/integrations/api/instance/database/importData', () => ({
	useImportDataMutation: () => ({ mutate, isPending: false }),
}));

vi.mock('sonner', () => ({ toast }));

vi.mock('@/features/instance/config/roles/operations/useOperationsAllowlistSupported', () => ({
	useOperationsAllowlistSupported: () => true,
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const withTable = { data: { dog: { attributes: [{ attribute: 'id', is_primary_key: true }] } } };

describe('ImportDataModal progress', () => {
	it('hands the import a progress toast and leaves the success toast to it', async () => {
		const onImported = vi.fn();
		render(
			<ImportDataModal
				isModalOpen
				setIsModalOpen={() => undefined}
				instanceDatabaseMap={withTable as never}
				databaseName="data"
				tableName="dog"
				initialMethod="url"
				onImported={onImported}
			/>,
		);

		fireEvent.change(screen.getByPlaceholderText('https://example.com/data.csv'), {
			target: { value: 'https://example.com/dogs.csv' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Import Data' }));

		await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
		const [variables, callbacks] = mutate.mock.calls[0] as [
			ImportDataParams,
			{ onSuccess: (result: { message: string }) => void },
		];
		expect(variables.source).toEqual({ kind: 'csv-url', url: 'https://example.com/dogs.csv' });

		variables.progress!.onJobUpdate({ id: 'job-1', status: 'IN_PROGRESS' });
		expect(toast.loading).toHaveBeenCalledTimes(1);

		callbacks.onSuccess({ message: 'loaded 5 of 5' });
		expect(onImported).toHaveBeenCalledWith('data', 'dog');
		expect(toast.success).not.toHaveBeenCalled();
	});
});
