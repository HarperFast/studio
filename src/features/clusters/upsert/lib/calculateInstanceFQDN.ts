import { defaultOperationsApiPort } from '@/config/constants';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { z } from 'zod';

export function calculateInstanceFQDN(instance: z.infer<typeof UpsertClusterSchema.shape.instances.element>) {
	let { secure, fqdn, port } = instance;
	if (!port) {
		port = defaultOperationsApiPort;
	}
	if (fqdn === '127.0.0.1') {
		fqdn = 'localhost';
	}
	if (port === 443 && secure === 'false') {
		secure = 'true';
	}
	if (port === 80 && secure === 'true') {
		secure = 'false';
	}
	return `${secure === 'true' ? 'https' : 'http'}://${fqdn}${port === 443 || port === 80 ? '' : (':' + port)}`.toLowerCase();
}
