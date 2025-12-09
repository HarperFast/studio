import { defaultOperationsApiPort } from '@/config/constants';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { z } from 'zod';

export function calculateInstanceFQDN(instance: z.infer<typeof UpsertClusterSchema.shape.instances.element>) {
	const { fqdn } = instance;
	let { secure, port } = instance;
	if (!port) {
		port = defaultOperationsApiPort;
	}
	if (port === 443 && secure === 'false') {
		secure = 'true';
	}
	if (port === 80 && secure === 'true') {
		secure = 'false';
	}
	return `${secure === 'true' ? 'https' : 'http'}://${fqdn}${port === 443 || port === 80 ? '' : (':' + port)}`
		.toLowerCase();
}
