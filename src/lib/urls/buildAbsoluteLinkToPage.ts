import { excludeFalsy } from '@/lib/arrays/excludeFalsy';

export function buildAbsoluteLinkToPage({
	clusterId,
	instanceId,
	organizationId,
}: {
	clusterId?: string;
	instanceId?: string;
	organizationId?: string;
}, page?: string): string {
	return '/' + [
		organizationId,
		clusterId,
		instanceId && 'instance',
		instanceId,
		page,
	].filter(excludeFalsy).join('/');
}
