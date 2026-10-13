import { excludeFalsy } from '@/lib/arrays/excludeFalsy';

export type AbsolutePath = `/${string}`;

export function buildAbsoluteLinkToPage({
	clusterId,
	instanceId,
	organizationId,
}: {
	clusterId?: string;
	instanceId?: string;
	organizationId?: string;
}, page?: string): AbsolutePath {
	const segments = [organizationId, clusterId, instanceId && 'instance', instanceId, page].filter(excludeFalsy);
	return `/${segments.join('/')}`;
}
