import { inputSchema } from '@harperfast/agent-tools/tools/dropComponentFile/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/dropComponentFile/serverSchema';
import { TrashIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const dropComponentFile: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: TrashIcon,
	execute,
	requiresApproval: true,
};
