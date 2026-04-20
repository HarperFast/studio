import { inputSchema } from '@harperfast/agent-tools/tools/readLogs/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/readLogs/serverSchema';
import { LogsIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const readLogs: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: LogsIcon,
	execute,
};
