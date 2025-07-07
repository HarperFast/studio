import { SchemaHdbInstance } from '@/lib/api.gen';

export function isHDBInstance(value: unknown): value is SchemaHdbInstance {
	return !!(value as SchemaHdbInstance)?.instanceFqdn;
}
