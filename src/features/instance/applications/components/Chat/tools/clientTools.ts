import { ToolNames } from '@harperfast/agent-tools/types/toolNames';
import type { ClientSideTool } from '../types/clientSideTool';
import { collectFeedback } from './collectFeedback/clientTool';
import { createApp } from './createApp/clientTool';
import { deleteTableRecords } from './deleteTableRecords/clientTool';
import { dropComponentFile } from './dropComponentFile/clientTool';
import { getAnalytics } from './getAnalytics/clientTool';
import { getComponentFile } from './getComponentFile/clientTool';
import { getComponents } from './getComponents/clientTool';
import { getDescribeAll } from './getDescribeAll/clientTool';
import { getDescribeTable } from './getDescribeTable/clientTool';
import { getUserContext } from './getUserContext/clientTool';
import { insertTableRecords } from './insertTableRecords/clientTool';
import { readHarperSkill } from './readHarperSkill/clientTool';
import { readLogs } from './readLogs/clientTool';
import { readTableRecords } from './readTableRecords/clientTool';
import { restartHTTPService } from './restartHTTPService/clientTool';
import { setComponentFile } from './setComponentFile/clientTool';
import { updateTableRecords } from './updateTableRecords/clientTool';

const clientTools: Record<ToolNames, ClientSideTool> = {
	// Application management.
	readHarperSkill,
	createApp,
	readLogs,
	getAnalytics,
	restartHTTPService,
	collectFeedback,
	getUserContext,
	// File manipulation.
	getComponentFile,
	getComponents,
	setComponentFile,
	dropComponentFile,
	// Database interaction.
	getDescribeAll,
	getDescribeTable,
	insertTableRecords,
	readTableRecords,
	updateTableRecords,
	deleteTableRecords,
};

export function getTool(name: ToolNames | string): ClientSideTool | undefined {
	return clientTools[name as ToolNames];
}
