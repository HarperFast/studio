import { inputSchema } from '@harperfast/agent-tools/tools/getComponents/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/getComponents/serverSchema';
import { FolderIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const getComponents: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: FolderIcon,
	execute,
};
