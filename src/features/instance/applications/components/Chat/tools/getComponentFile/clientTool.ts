import { inputSchema } from '@harperfast/agent-tools/tools/getComponentFile/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/getComponentFile/serverSchema';
import { FileIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const getComponentFile: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: FileIcon,
	execute,
};
