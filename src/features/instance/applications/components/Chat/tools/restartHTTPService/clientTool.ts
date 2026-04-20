import { inputSchema } from '@harperfast/agent-tools/tools/restartHTTPService/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/restartHTTPService/serverSchema';
import { RefreshCwIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const restartHTTPService: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: RefreshCwIcon,
	execute,
	requiresApproval: true,
};
