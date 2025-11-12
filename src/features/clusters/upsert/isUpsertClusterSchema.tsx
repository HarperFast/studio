import { UpsertClusterSchemaType } from './upsertClusterSchema';

export function isUpsertClusterSchema(instance: unknown): instance is UpsertClusterSchemaType {
	return (instance as UpsertClusterSchemaType)?.clusterName !== undefined;
}
