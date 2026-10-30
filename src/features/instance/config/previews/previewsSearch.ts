export interface PreviewsSearch {
	/** The application the page shows. */
	project?: string;
}

export function validatePreviewsSearch(search: Record<string, unknown>): PreviewsSearch {
	const project = typeof search.project === 'string' ? search.project.trim() : '';
	return { project: project || undefined };
}
