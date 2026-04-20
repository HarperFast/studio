import { setComponentFile } from '@/integrations/api/instance/applications/setComponentFile';
import { emitToListeners } from '@/lib/events/listener';
import { queryClient } from '@/react-query/queryClient';
import { inputSchema } from '@harperfast/agent-tools/tools/setComponentFile/inputSchema';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { Output } from './output';

export async function execute(
	{ input: { path, encoding, payload }, instanceClientParams }: ExecuteParams<z.infer<typeof inputSchema>>,
): Promise<Output> {
	try {
		const parts = path.split('/');
		const project = parts.shift()!;
		const file = parts.join('/');
		const data = await setComponentFile({ ...instanceClientParams, file, project, payload, encoding });

		await queryClient.invalidateQueries({
			queryKey: [instanceClientParams.entityId, 'get_component_file', project, file],
		});
		emitToListeners('ReloadApplicationRootEntries', true);

		return {
			success: true,
			data,
		};
	} catch (err) {
		return {
			success: false,
			message: `Error: ${err}`,
		};
	}
}
