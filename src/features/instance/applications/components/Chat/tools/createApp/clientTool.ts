import { inputSchema } from '@harperfast/agent-tools/tools/createApp/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/createApp/serverSchema';
import { PlusIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const createApp: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: PlusIcon,
	execute,
	requiresApproval: true,
};
