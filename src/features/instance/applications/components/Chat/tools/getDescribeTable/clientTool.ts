import { inputSchema } from '@harperfast/agent-tools/tools/getDescribeTable/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/getDescribeTable/serverSchema';
import { TableIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const getDescribeTable: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: TableIcon,
	execute,
};
