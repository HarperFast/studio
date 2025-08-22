import { defaultOperationsApiPort } from '@/config/constants';
import { NewClusterSchema } from '@/features/clusters/modals/NewClusterModal/newClusterSchema';
import { z } from 'zod';

export function calculateInstanceFQDN(instance: z.infer<typeof NewClusterSchema.shape.instances.element>) {
	const { secure, fqdn } = instance;
	const port = instance.port || defaultOperationsApiPort;
	return `${secure === 'true' ? 'https' : 'http'}://${fqdn}${port === 443 || port === 80 ? '' : (':' + port)}`.toLowerCase();
}
