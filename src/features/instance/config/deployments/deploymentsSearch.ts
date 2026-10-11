import { DeploymentStatus } from '@/integrations/api/instance/deployments/types';

/** The Deployments page's filters and page, kept in the URL so a link can open it filtered. */
export interface DeploymentsSearch {
	project?: string;
	status?: DeploymentStatus;
	/** 1-based. */
	page?: number;
}

/** What `list_deployments` can filter on. `staged` only exists from Harper 5.3.0. */
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
