/**
 * @vitest-environment jsdom
 */
import { ImportDataModal } from '@/features/instance/databases/modals/ImportDataModal';
import { OUTCOME_UNKNOWN_TITLE } from '@/integrations/api/unansweredWrite';
import { mutationErrorHandler } from '@/react-query/queryClient';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const instance = vi.hoisted(() => ({ client: undefined as unknown }));
const toast = vi.hoisted(() => ({
	error: vi.fn(),
	loading: vi.fn(() => 'progress-toast'),
	success: vi.fn(),
	dismiss: vi.fn(),
}));

vi.mock('sonner', () => ({ toast }));

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ instanceId: 'instance-1' }),
}));

vi.mock('@/hooks/useAuth', () => ({
	useInstanceAuth: () => ({ user: { role: { permission: { super_user: true } } } }),
	isAdminMode: () => false,
	useCloudAuth: () => ({ user: null }),
}));

vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient: instance.client, entityId: 'entity-1', entityType: 'instance' }),
}));

vi.mock('@/features/instance/config/roles/operations/useOperationsAllowlistSupported', () => ({
	useOperationsAllowlistSupported: () => true,
}));

type Poll = { status: string; message?: string } | 'no-answer' | 'missing';

function instanceClient(polls: Poll[]) {
	let poll = 0;
	const client = axios.create();
	client.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
		const { operation } = JSON.parse(config.data as string) as { operation: string };
		const answer = (data: unknown) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
		if (operation === 'csv_url_load') {
			return answer({ message: 'Starting job', job_id: 'job-7' });
		}
		const next = polls[Math.min(poll, polls.length - 1)];
		poll += 1;
		if (next === 'no-answer') {
			throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
		}
		return answer(next === 'missing' ? [] : [{ id: 'job-7', ...next }]);
	};
	return client;
}

const withTable = { data: { dog: { attributes: [{ attribute: 'id', is_primary_key: true }] } } };

async function importFromUrl(polls: Poll[], waitMs: number) {
	instance.client = instanceClient(polls);
	const onImported = vi.fn();
	const queryClient = new QueryClient({ mutationCache: new MutationCache({ onError: mutationErrorHandler }) });
	render(
		<QueryClientProvider client={queryClient}>
			<ImportDataModal
				isModalOpen
				setIsModalOpen={() => undefined}
				instanceDatabaseMap={withTable as never}
				databaseName="data"
				tableName="dog"
				initialMethod="url"
				onImported={onImported}
			/>
		</QueryClientProvider>,
	);
	fireEvent.change(screen.getByPlaceholderText('https://example.com/data.csv'), {
		target: { value: 'https://example.com/dogs.csv' },
	});
	fireEvent.click(screen.getByRole('button', { name: 'Import Data' }));
	await act(() => vi.advanceTimersByTimeAsync(waitMs));
	return { onImported };
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
	vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

describe('ImportDataModal when Studio stops following the job', () => {
	const anyNode = "If your role can list jobs, also look for job job-7 on the Status page's Jobs tab.";
	it.each([
		['the polls stop answering', [{ status: 'IN_PROGRESS' }, 'no-answer'] as Poll[], 20_000, anyNode],
		[
			'the node Studio reaches does not have the job',
			[{ status: 'IN_PROGRESS' }, 'missing'] as Poll[],
			30_000,
			"look for job job-7 on the Jobs tab of each instance's Status page",
		],
		['the job is still running at the deadline', [{ status: 'IN_PROGRESS' }] as Poll[], 11 * 60_000, anyNode],
	])('reports an unknown outcome, never a failure, when %s', async (_, polls, waitMs, where) => {
		const { onImported } = await importFromUrl(polls, waitMs);

		expect(toast.loading).toHaveBeenCalled();
		expect(toast.dismiss).toHaveBeenCalledWith('progress-toast');
		expect(toast.error).toHaveBeenCalledTimes(1);
		const [title, options] = toast.error.mock.calls[0] as unknown as [string, { description: string }];
		expect(title).toBe(OUTCOME_UNKNOWN_TITLE);
		expect(options.description).toContain('It may still be running, or it may have finished.');
		expect(options.description).toContain('Check the table before you import this data again');
		expect(options.description).toContain(where);
		expect(toast.success).not.toHaveBeenCalled();
		expect(onImported).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Import Data' })).toBeTruthy();
	});

	it('still reports a job Harper finished with ERROR as a failure, in its own words', async () => {
		const { onImported } = await importFromUrl(
			[{ status: 'IN_PROGRESS' }, { status: 'ERROR', message: 'CSV was malformed' }],
			5_000,
		);

		expect(toast.dismiss).toHaveBeenCalledWith('progress-toast');
		expect(toast.error).toHaveBeenCalledTimes(1);
		const [title, options] = toast.error.mock.calls[0] as unknown as [string, { description: string }];
		expect(title).not.toBe(OUTCOME_UNKNOWN_TITLE);
		expect(options.description).toBe('CSV was malformed');
		expect(onImported).not.toHaveBeenCalled();
	});
});
