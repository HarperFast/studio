import { Instance } from '@/lib/api.patch';

export function isInstance(value: unknown): value is Instance {
	return !!(value as Instance)?.instanceFqdn;
}
