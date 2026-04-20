import { dropComponent } from '@/integrations/api/instance/applications/dropComponent';
import { inputSchema } from '@harperfast/agent-tools/tools/dropComponentFile/inputSchema';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { Output } from './output';

export async function execute(
	{ input: { path }, instanceClientParams }: ExecuteParams<z.infer<typeof inputSchema>>,
): Promise<Output> {
	try {
		const parts = path.split('/');
		const project = parts.shift()!;
		const file = parts.join('/');
		const data = await dropComponent({ ...instanceClientParams, file, project });
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
