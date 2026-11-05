export interface DeployFromGitHubSearch {
	project?: string;
}

export function validateDeployFromGitHubSearch(search: Record<string, unknown>): DeployFromGitHubSearch {
	const project = typeof search.project === 'string' ? search.project.trim() : '';
	return { project: project || undefined };
}
