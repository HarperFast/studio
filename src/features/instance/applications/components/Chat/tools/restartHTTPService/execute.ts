import { restartInstance } from '@/integrations/api/instance/status/restartInstance';
import { RestartUnconfirmedError } from '@/integrations/api/instance/status/restartUnconfirmed';
import { inputSchema } from '@harperfast/agent-tools/tools/restartHTTPService/inputSchema';
import { toast } from 'sonner';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { describeToolError, toastToolFailure } from '../describeToolError';
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
		toastToolFailure(toastId, err);
		if (err instanceof RestartUnconfirmedError) {
			// `success` is whether the tool's own action was carried out, and Harper accepted the restart.
			return {
				success: true,
				message: "Harper accepted the restart, but Studio couldn't confirm the HTTP service came back, so it may "
					+ "still be starting. Don't restart it again until its status shows it is back, or it goes down a "
					+ 'second time.',
				webURL: baseURL,
			};
		}
		return {
			success: false,
			message: `Error: ${describeToolError(err)}`,
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
