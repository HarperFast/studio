import { inputSchema } from '@harperfast/agent-tools/tools/updateTableRecords/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/updateTableRecords/serverSchema';
import { BetweenHorizonalStartIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const updateTableRecords: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: BetweenHorizonalStartIcon,
	execute,
	requiresApproval: true,
};
