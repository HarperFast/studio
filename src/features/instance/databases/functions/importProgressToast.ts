import type { HarperJob } from '@/integrations/api/instance/database/getJob';
import type { ImportDataResult, ImportProgressListener } from '@/integrations/api/instance/database/importData';
import { formatDuration } from '@/lib/formatDuration';
import { toast } from 'sonner';

export const IMPORT_PROGRESS_TITLE = 'Importing data…';

/**
 * The progress line for a polled load job. Harper writes nothing to a job between starting and
 * finishing it, so its state and the time since submission are all there is to report.
 */
export function describeImportJob(job: HarperJob, elapsedMs: number): string {
	const state = job.status?.toUpperCase() === 'CREATED' ? 'Queued' : 'Running';
	return `${state} · ${formatDuration(elapsedMs)} · job ${job.id}`;
}

/** On failure the progress toast is only dismissed: the global mutation handler already toasts the error. */
export function createImportProgressToast(now: () => number = Date.now): ImportProgressListener {
	const submittedAt = now();
	let toastId: string | number | undefined;
	return {
		onJobUpdate(job: HarperJob) {
			toastId = toast.loading(IMPORT_PROGRESS_TITLE, {
				id: toastId,
				description: describeImportJob(job, now() - submittedAt),
			});
		},
		onSuccess({ message }: ImportDataResult) {
			toast.success(message, { id: toastId, description: undefined });
		},
		onError() {
			if (toastId !== undefined) {
				toast.dismiss(toastId);
			}
		},
	};
}
