import { inputSchema } from '@harperfast/agent-tools/tools/deleteTableRecords/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/deleteTableRecords/serverSchema';
import { BetweenHorizonalStartIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const deleteTableRecords: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: BetweenHorizonalStartIcon,
	execute,
	requiresApproval: true,
};
