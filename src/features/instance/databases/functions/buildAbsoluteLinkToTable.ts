import { excludeFalsy } from '@/lib/arrays/excludeFalsy';

export function buildAbsoluteLinkToTable({
	clusterId,
	databaseName,
	instanceId,
	organizationId,
	tableName,
}: {
	clusterId?: string;
	databaseName?: string;
	instanceId?: string;
	organizationId?: string;
	tableName?: string;
}): string {
	const databases = [`databases`, databaseName, tableName].filter(excludeFalsy).join('/');
	if (organizationId) {
		return '/' + [
			'orgs',
			organizationId,
			clusterId,
			instanceId && 'instance',
			instanceId,
			databases,
		].filter(excludeFalsy).join('/')
;	}
	return `/${databases}`;
}
