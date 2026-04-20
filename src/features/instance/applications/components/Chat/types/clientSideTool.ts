import { ServerSideTool } from '@harperfast/agent-tools/types/serverSideTool';
import type { ToolCallPart } from 'ai';
import type { ComponentType, ReactNode } from 'react';
import type { ExecuteParams } from './executeParams';

export interface ClientSideTool<TInput = any, TOutput = any> extends ServerSideTool<TInput> {
	execute: (params: ExecuteParams<TInput>) => Promise<TOutput>;
	render?: (part: ToolCallPart & { state: 'output-available'; output: TOutput }) => ReactNode;
	icon?: ComponentType<{ size?: number | string }>;
	requiresApproval?: boolean;
}
