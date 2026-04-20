import { inputSchema } from '@harperfast/agent-tools/tools/readHarperSkill/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/readHarperSkill/serverSchema';
import { BookIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const readHarperSkill: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: BookIcon,
	execute,
};
