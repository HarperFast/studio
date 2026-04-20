import { inputSchema } from '@harperfast/agent-tools/tools/getDescribeAll/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/getDescribeAll/serverSchema';
import { DatabaseIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const getDescribeAll: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: DatabaseIcon,
	execute,
};
