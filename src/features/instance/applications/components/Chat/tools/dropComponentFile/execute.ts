import { invalidateApplicationConfiguration } from '@/features/instance/applications/hooks/useBranchedDatabases';
import { forgetDeletedPath } from '@/features/instance/applications/lib/editorPathState';
import { dropComponent } from '@/integrations/api/instance/applications/dropComponent';
import { queryClient } from '@/react-query/queryClient';
import { inputSchema } from '@harperfast/agent-tools/tools/dropComponentFile/inputSchema';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { describeToolError } from '../describeToolError';
import { Output } from './output';

export async function execute(
	{ input: { path }, instanceClientParams }: ExecuteParams<z.infer<typeof inputSchema>>,
): Promise<Output> {
	try {
		const parts = path.split('/');
		const project = parts.shift()!;
		const file = parts.join('/');
		const data = await dropComponent({ ...instanceClientParams, file, project }).finally(() => {
			// After it settles, either way: a drop whose answer was lost may still have removed the application.
			if (!file) {
				void invalidateApplicationConfiguration(queryClient, instanceClientParams.entityId);
			}
		});
		forgetDeletedPath(queryClient, instanceClientParams.entityId, path.replace(/\/+$/, ''));
		return {
			success: true,
			data,
		};
	} catch (err) {
		return {
			success: false,
			message: `Error: ${describeToolError(err)}`,
		};
	}
}
