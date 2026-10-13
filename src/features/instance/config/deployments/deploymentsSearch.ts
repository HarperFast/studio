import { DeploymentStatus } from '@/integrations/api/instance/deployments/types';

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
];

export function filterableStatuses(stagingSupported: boolean): readonly DeploymentStatus[] {
	return stagingSupported ? FILTERABLE_STATUSES : FILTERABLE_STATUSES.filter((status) => status !== 'staged');
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
