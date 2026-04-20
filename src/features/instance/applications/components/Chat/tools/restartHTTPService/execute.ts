import { restartInstance } from '@/integrations/api/instance/status/restartInstance';
import { inputSchema } from '@harperfast/agent-tools/tools/restartHTTPService/inputSchema';
import { toast } from 'sonner';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { Output } from './output';

export async function execute(
	{ instanceClientParams, baseURL }: ExecuteParams<z.infer<typeof inputSchema>>,
): Promise<Output> {
	const toastId = toast.loading(`Restarting HTTP service...`, {
		description: 'This may take a bit.',
		duration: 300_000,
	});

	try {
		await restartInstance({
			...instanceClientParams,
			operation: 'restart_service',
			replicated: instanceClientParams.entityType === 'cluster',
		});
	} catch (err) {
		return {
			success: false,
			message: `Error: ${err}`,
		};
	}

	toast.success(`Done!`, {
		description: `HTTP Service restarted!`,
		id: toastId,
		duration: 5_000,
	});

	return {
		success: true,
		message: `HTTP Service restarted!`,
		webURL: baseURL,
	};
}
