import { inputSchema } from '@harperfast/agent-tools/tools/listAnalyticsMetrics/inputSchema';
import { serverSchema } from '@harperfast/agent-tools/tools/listAnalyticsMetrics/serverSchema';
import { ChartAreaIcon } from 'lucide-react';
import { z } from 'zod';
import type { ClientSideTool } from '../../types/clientSideTool';
import { execute } from './execute';
import { Output } from './output';

export const listAnalyticsMetrics: ClientSideTool<z.infer<typeof inputSchema>, Output> = {
	...serverSchema,
	icon: ChartAreaIcon,
	execute,
};
