import { getSessionStorage } from '@/lib/storage/getSessionStorage';
import { currentUrlAfterHash } from '@/lib/urls/currentUrlAfterHash';
import { inputSchema } from '@harperfast/agent-tools/tools/getUserContext/inputSchema';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { Output } from './output';

export async function execute(
	{ instanceClientParams, params }: ExecuteParams<z.infer<typeof inputSchema>>,
): Promise<Output> {
	const url = currentUrlAfterHash();

	if (url.includes('/databases')) {
		const { databaseName, tableName } = params;
		return {
			success: true,
			description: 'viewing the database',
			data: {
				databaseName,
				tableName,
			},
		};
	}

	if (url.endsWith('/apis')) {
		return {
			success: true,
			description: 'viewing the APIs',
		};
	}

	if (url.endsWith('/status')) {
		return {
			success: true,
			description: 'viewing the status graphs',
		};
	}

	if (url.endsWith('/logs')) {
		return {
			success: true,
			description: 'viewing the logs',
		};
	}

	if (url.includes('/config/')) {
		return {
			success: true,
			description: 'viewing the configuration pages',
		};
	}

	const focusedItem = getSessionStorage(
		`FileFocused/${instanceClientParams.entityId}` as 'FileFocused/{entityId}',
		undefined,
	);
	const expandedItems = getSessionStorage(
		`FolderOpened/${instanceClientParams.entityId}` as 'FolderOpened/{entityId}',
		[],
	);
	const selectedItems = getSessionStorage(
		`FileSelected/${instanceClientParams.entityId}` as 'FileSelected/{entityId}',
		[],
	);

	if (focusedItem) {
		return {
			success: true,
			description: 'editing application files',
			data: {
				openedPath: focusedItem,
				expandedItems,
				selectedItems,
			},
		};
	}

	return {
		success: true,
		description: url,
	};
}
