import { parseGitHubRepository } from '@/integrations/github/lookUpGitHubRepository';

export interface DeployFromGitHubSearch {
	project?: string;
	repository?: string;
}

export function validateDeployFromGitHubSearch(search: Record<string, unknown>): DeployFromGitHubSearch {
	const project = typeof search.project === 'string' ? search.project.trim() : '';
	const repository = typeof search.repository === 'string' ? parseGitHubRepository(search.repository) : undefined;
	return { project: project || undefined, repository };
}
