import { inputSchema } from '@harperfast/agent-tools/tools/readTableRecords/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/readTableRecords/serverSchema';
import { SearchIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const readTableRecords: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: SearchIcon,
	execute,
};
