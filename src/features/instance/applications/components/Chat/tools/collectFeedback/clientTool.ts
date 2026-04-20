import { inputSchema } from '@harperfast/agent-tools/tools/collectFeedback/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/collectFeedback/serverSchema';
import { MessageSquareHeartIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const collectFeedback: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: MessageSquareHeartIcon,
	execute,
};
