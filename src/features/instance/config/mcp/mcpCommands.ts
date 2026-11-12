import { OPERATION_CATALOG } from '@/features/instance/config/roles/operations/operationsCatalog';
import {
	isMcpOperationIncluded,
	matchesMcpPattern,
	MCP_DEFAULT_ALLOW,
	McpCommandList,
	writeMcpCommandList,
} from '@/integrations/api/instance/mcp/mcpConfig';
import { isReadOperation } from '@/integrations/api/isReadOperation';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';

export const OTHER_CATEGORY = 'Other';

export interface McpCommand {
	name: string;
	category: string;
	/**
	 * Studio's own read classifier, not Harper's `destructiveHint`, which misses `drop_component` and
	 * `deploy_component` (HarperFast/harper#3075). Anything it does not recognize as a read counts as a change.
	 */
	changesData: boolean;
}

const categoryByName = new Map(OPERATION_CATALOG.map((operation) => [operation.name, operation.category]));

export function isMcpPattern(entry: string): boolean {
	return entry.includes('*');
}

function describe(name: string): McpCommand {
	return { name, category: categoryByName.get(name) ?? OTHER_CATEGORY, changesData: !isReadOperation(name) };
}

/**
 * Every command name Studio knows for this version: the role catalog (aliases included, since the MCP server lists
 * each spelling as its own tool) plus whatever the list names outright. Commands a component registers, and core
 * ones the catalog omits, are unknown here; patterns still reach them on the instance.
 */
export function knownMcpCommands(version: string, list: McpCommandList): McpCommand[] {
	const names = new Set(
		OPERATION_CATALOG
			.filter((operation) => !operation.addedIn || wasAReleasedBeforeB(operation.addedIn, version))
			.map((operation) => operation.name),
	);
	for (const entry of [...list.added, ...list.removed]) {
		if (!isMcpPattern(entry)) {
			names.add(entry);
		}
	}
	return [...names].sort().map(describe);
}

export function includedMcpCommands(version: string, list: McpCommandList): McpCommand[] {
	const stored = writeMcpCommandList(list);
	return knownMcpCommands(version, list).filter((command) => isMcpOperationIncluded(command.name, stored));
}

export function isDefaultMcpCommand(name: string, list: McpCommandList): boolean {
	return list.includesDefaults && matchesMcpPattern(name, MCP_DEFAULT_ALLOW);
}

export function removeMcpCommand(list: McpCommandList, name: string): McpCommandList {
	const added = list.added.filter((entry) => entry !== name);
	const stillIncluded = isMcpOperationIncluded(name, writeMcpCommandList({ ...list, added }));
	return {
		...list,
		added,
		removed: stillIncluded ? [...new Set([...list.removed, name])].sort() : list.removed,
	};
}

/** A removed pattern that matches the name has to go too: Harper's deny always wins over its allow. */
export function addMcpCommand(list: McpCommandList, name: string): McpCommandList {
	const removed = list.removed.filter((entry) => entry !== name && !matchesMcpPattern(name, [entry]));
	const lifted = { ...list, removed };
	if (isMcpOperationIncluded(name, writeMcpCommandList(lifted))) {
		return lifted;
	}
	return { ...lifted, added: [...new Set([...list.added, name])].sort() };
}

export function dropAddedMcpEntry(list: McpCommandList, entry: string): McpCommandList {
	return { ...list, added: list.added.filter((existing) => existing !== entry) };
}

export function restoreMcpCommand(list: McpCommandList, entry: string): McpCommandList {
	return { ...list, removed: list.removed.filter((existing) => existing !== entry) };
}
