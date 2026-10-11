import type { InstanceClientConfig, InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { pollUnlessForbidden, retryUnlessRejected } from '@/react-query/pollUnlessForbidden';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';

export const SEARCH_JOBS_OPERATION = 'search_jobs_by_start_date';

/**
 * A `system.hdb_job` row as `search_jobs_by_start_date` returns it. Harper strips `request` (it holds
 * the whole job request — a CSV body, S3 credentials) and its internal owner/timestamp attributes
 * before answering (harper `server/jobs/jobs.ts`, `handleGetJobsByStartDate`).
 */
export interface JobRecord {
	id: string;
	/** The operation that queued the job, e.g. `csv_url_load`. */
	type?: string;
	/** CREATED → IN_PROGRESS → COMPLETE | ERROR. */
	status?: string;
	/** Usually text. A refused bulk load records its structured permission report here instead. */
	message?: unknown;
	/** What a job whose operation returned a non-string value finished with. */
	result?: unknown;
	user?: string;
	created_datetime?: number;
	start_datetime?: number;
	end_datetime?: number;
}

/**
 * Harper compares `start_datetime < to_date` strictly, against its own clock. An upper bound at this
 * browser's `now` would hide a job that just started on a server whose clock runs ahead, so the bound
 * sits well past any plausible skew — no job can start in the future anyway.
 */
const CLOCK_SKEW_ALLOWANCE_MS = 24 * 60 * 60 * 1000;

function jobStartTime(job: JobRecord): number {
	return job.start_datetime ?? job.created_datetime ?? 0;
}

/** Newest first: Harper answers in no particular order. */
export async function searchJobs(
	{ instanceClient, windowMs, now }: { windowMs: number; now: number } & InstanceClientConfig,
): Promise<JobRecord[]> {
	const { data } = await instanceClient.post<unknown>('/', {
		operation: SEARCH_JOBS_OPERATION,
		from_date: new Date(now - windowMs).toISOString(),
		to_date: new Date(now + CLOCK_SKEW_ALLOWANCE_MS).toISOString(),
	});
	if (!Array.isArray(data)) {
		throw new Error(`Harper answered ${SEARCH_JOBS_OPERATION} with something other than a list of jobs.`);
	}
	return (data as JobRecord[]).sort((a, b) => jobStartTime(b) - jobStartTime(a));
}

export function getSearchJobsQueryOptions({
	entityId,
	instanceClient,
	windowMs,
	refreshMs,
	enabled,
}: { windowMs: number; refreshMs: number; enabled: boolean } & InstanceClientIdConfig) {
	return queryOptions({
		// The window is computed per fetch, so the key holds its width rather than its bounds: each poll
		// slides the same query forward instead of minting a new cache entry.
		queryKey: [SEARCH_JOBS_OPERATION, entityId, windowMs] as const,
		queryFn: () => searchJobs({ instanceClient, windowMs, now: Date.now() }),
		refetchInterval: pollUnlessForbidden(refreshMs > 0 ? refreshMs : false),
		retry: retryUnlessRejected(),
		placeholderData: keepPreviousData,
		staleTime: 5_000,
		enabled,
	});
}
