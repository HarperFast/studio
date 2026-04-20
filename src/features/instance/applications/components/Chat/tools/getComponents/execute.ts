import { buildItems } from '@/features/instance/applications/components/ApplicationsSidebar/buildItems';
import {
	calculateRootEntries,
} from '@/features/instance/applications/components/ApplicationsSidebar/calculateRootEntries';
import { getComponents } from '@/integrations/api/instance/applications/getComponents';
import { inputSchema } from '@harperfast/agent-tools/tools/getComponents/inputSchema';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { Output } from './output';

export async function execute(
	{ instanceClientParams }: ExecuteParams<z.infer<typeof inputSchema>>,
): Promise<Output> {
	try {
		const data = await getComponents(instanceClientParams);
		const { rootEntries } = calculateRootEntries(data.entries);
		return {
			success: true,
			items: buildItems(rootEntries).items,
		};
	} catch (err) {
		return {
			success: false,
			message: `Error: ${err}`,
		};
	}
}
