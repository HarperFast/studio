import { excludeFalsy } from '@/lib/arrays/excludeFalsy';

export function buildAbsoluteLinkToTable({
	clusterId,
	databaseName,
	organizationId,
	tableName,
}: {
	clusterId?: string;
	databaseName?: string;
	organizationId?: string;
	tableName?: string;
}): string {
	const databases = [`databases`, databaseName, tableName].filter(excludeFalsy).join('/');
	if (organizationId) {
		return `/orgs/${organizationId}/${clusterId}/${databases}`;
	}
	return `/${databases}`;
}
