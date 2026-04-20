import { inputSchema } from '@harperfast/agent-tools/tools/setComponentFile/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/setComponentFile/serverSchema';
import { FilePenIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const setComponentFile: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: FilePenIcon,
	execute,
	requiresApproval: true,
};
