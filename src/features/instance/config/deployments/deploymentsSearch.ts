import { supportsReleaseTracking } from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { DeploymentStatus } from '@/integrations/api/instance/deployments/types';

export interface DeploymentsSearch {
	project?: string;
	status?: DeploymentStatus;
	/** The commit a record's `source` names (5.4.0-alpha.1+). Harper matches it exactly. */
	sha?: string;
	/** 1-based. */
	page?: number;
}

// `rolled_back` is left out: no Harper version writes it, so the filter could only ever come back empty.
export const FILTERABLE_STATUSES: readonly DeploymentStatus[] = [
	'pending',
	'extracting',
	'installing',
	'loading',
	'replicating',
	'restarting',
	'success',
	'failed',
	'staged',
	'rolling_out',
	'partial',
];

const ROLLING_STATUSES: readonly DeploymentStatus[] = ['rolling_out', 'partial'];

export function filterableStatuses(stagingSupported: boolean, harperVersion?: string): readonly DeploymentStatus[] {
	// Harper writes them from 5.4.0-alpha.1 (harper `v5.4.0-alpha.1:components/deploymentOperations.ts:22`).
	const rollingSupported = supportsReleaseTracking(harperVersion);
	return FILTERABLE_STATUSES.filter((status) =>
		(stagingSupported || status !== 'staged') && (rollingSupported || !ROLLING_STATUSES.includes(status))
	);
}

export const DEPLOYMENTS_PAGE_SIZE = 25;

/** A full or abbreviated commit, SHA-1 or SHA-256. Harper compares it whole, so only a full one matches anything. */
const COMMIT_SHA = /^[0-9a-f]{7,64}$/i;

export function isCommitSha(value: string): boolean {
	return COMMIT_SHA.test(value);
}

export function validateDeploymentsSearch(search: Record<string, unknown>): DeploymentsSearch {
	const project = typeof search.project === 'string' ? search.project.trim() : '';
	const status = FILTERABLE_STATUSES.find((candidate) => candidate === search.status);
	const page = Number(search.page);
	const sha = typeof search.sha === 'string' && COMMIT_SHA.test(search.sha.trim()) ? search.sha.trim() : undefined;
	return {
		project: project || undefined,
		status,
		sha,
		page: Number.isInteger(page) && page > 1 ? page : undefined,
	};
}
