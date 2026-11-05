import { DeploymentStatus } from '@/integrations/api/instance/deployments/types';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';

export interface DeploymentsSearch {
	project?: string;
	status?: DeploymentStatus;
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

/**
 * Harper writes `rolling_out` and `partial` from 5.4.0-alpha.1 (harper
 * `v5.4.0-alpha.1:components/deploymentOperations.ts:22`).
 */
export const MIN_ROLLING_STATUS_VERSION = '5.4.0-alpha.1';

const ROLLING_STATUSES: readonly DeploymentStatus[] = ['rolling_out', 'partial'];

export function filterableStatuses(stagingSupported: boolean, harperVersion?: string): readonly DeploymentStatus[] {
	const rollingSupported = !!harperVersion && wasAReleasedBeforeB(MIN_ROLLING_STATUS_VERSION, harperVersion);
	return FILTERABLE_STATUSES.filter((status) =>
		(stagingSupported || status !== 'staged') && (rollingSupported || !ROLLING_STATUSES.includes(status))
	);
}

export const DEPLOYMENTS_PAGE_SIZE = 25;

export function validateDeploymentsSearch(search: Record<string, unknown>): DeploymentsSearch {
	const project = typeof search.project === 'string' ? search.project.trim() : '';
	const status = FILTERABLE_STATUSES.find((candidate) => candidate === search.status);
	const page = Number(search.page);
	return {
		project: project || undefined,
		status,
		page: Number.isInteger(page) && page > 1 ? page : undefined,
	};
}
