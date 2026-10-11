import { afterEach, describe, expect, it, vi } from 'vitest';
import { createImportProgressToast, describeImportJob, IMPORT_PROGRESS_TITLE } from './importProgressToast';

const toast = vi.hoisted(() => ({
	loading: vi.fn((_title: string, data?: { id?: string | number }) => data?.id ?? 'toast-1'),
	success: vi.fn(),
	dismiss: vi.fn(),
}));

vi.mock('sonner', () => ({ toast }));

afterEach(() => {
	vi.clearAllMocks();
});

describe('describeImportJob', () => {
	it('reads a job no worker has picked up yet as queued', () => {
		expect(describeImportJob({ id: 'j1', status: 'CREATED' }, 2_000)).toBe('Queued · 2s · job j1');
	});

	it('reads any other unfinished job as running', () => {
		expect(describeImportJob({ id: 'j1', status: 'IN_PROGRESS' }, 75_000)).toBe('Running · 1m 15s · job j1');
	});
});

describe('createImportProgressToast', () => {
	it('opens one loading toast on the first job update and keeps updating that same toast', () => {
		let now = 1_000;
		const progress = createImportProgressToast(() => now);

		now = 1_500;
		progress.onJobUpdate({ id: 'j1', status: 'CREATED' });
		now = 4_000;
		progress.onJobUpdate({ id: 'j1', status: 'IN_PROGRESS' });

		expect(toast.loading).toHaveBeenNthCalledWith(1, IMPORT_PROGRESS_TITLE, {
			id: undefined,
			description: 'Queued · 500 ms · job j1',
		});
		expect(toast.loading).toHaveBeenNthCalledWith(2, IMPORT_PROGRESS_TITLE, {
			id: 'toast-1',
			description: 'Running · 3s · job j1',
		});
	});

	it('turns the progress toast into the result on success', () => {
		const progress = createImportProgressToast(() => 0);
		progress.onJobUpdate({ id: 'j1', status: 'IN_PROGRESS' });
		progress.onSuccess({ message: 'successfully loaded 10 of 10 records' });

		expect(toast.success).toHaveBeenCalledWith('successfully loaded 10 of 10 records', {
			id: 'toast-1',
			description: undefined,
		});
	});

	it('reports the result in a toast of its own when the import ran no job', () => {
		const progress = createImportProgressToast(() => 0);
		progress.onSuccess({ message: 'Inserted 3 records' });

		expect(toast.loading).not.toHaveBeenCalled();
		expect(toast.success).toHaveBeenCalledWith('Inserted 3 records', { id: undefined, description: undefined });
	});

	it('dismisses the progress toast on failure, leaving the error to the global handler', () => {
		const progress = createImportProgressToast(() => 0);
		progress.onJobUpdate({ id: 'j1', status: 'IN_PROGRESS' });
		progress.onError();

		expect(toast.dismiss).toHaveBeenCalledWith('toast-1');
		expect(toast.success).not.toHaveBeenCalled();
	});

	it('dismisses nothing on a failure that came before any job', () => {
		createImportProgressToast(() => 0).onError();
		expect(toast.dismiss).not.toHaveBeenCalled();
	});
});
