import { inputSchema } from '@harperfast/agent-tools/tools/insertTableRecords/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/insertTableRecords/serverSchema';
import { BetweenHorizonalStartIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const insertTableRecords: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: BetweenHorizonalStartIcon,
	execute,
	requiresApproval: true,
};
