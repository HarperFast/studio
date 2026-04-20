import { inputSchema } from '@harperfast/agent-tools/tools/getUserContext/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/getUserContext/serverSchema';
import { UserIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const getUserContext: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: UserIcon,
	execute,
};
