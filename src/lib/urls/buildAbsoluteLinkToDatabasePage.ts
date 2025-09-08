import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';

export function buildAbsoluteLinkToDatabasePage({
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
	return buildAbsoluteLinkToPage({
		organizationId,
		instanceId,
		clusterId,
	}, databases);
}
