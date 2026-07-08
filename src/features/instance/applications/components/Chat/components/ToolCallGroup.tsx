import type { ToolNames } from '@harperfast/agent-tools/types/toolNames';
import { getToolName } from 'ai';
import { Check, ChevronDown, ChevronRight, Loader2, Wrench, XCircle } from 'lucide-react';
import { useState } from 'react';
import { getTool } from '../tools/clientTools';
import type { ChatToolPart } from './groupMessageParts';
import { ToolInvocation } from './ToolInvocation';

interface ToolCallGroupProps {
	parts: ChatToolPart[];
	onApprove?: (toolCallId: string) => void;
	onDeny?: (toolCallId: string) => void;
	onAlwaysApprove?: (toolCallId: string) => void;
	approvingToolCallIds?: Set<string>;
}

export function ToolCallGroup({ parts, onApprove, onDeny, onAlwaysApprove, approvingToolCallIds }: ToolCallGroupProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const isRunning = parts.some(part => part.state !== 'output-available' && part.state !== 'output-error');
	const hasError = parts.some(part =>
		part.state === 'output-error' || (part.state === 'output-available' && (part.output as any)?.error)
	);
	const singleToolName = parts.length === 1 ? getToolName(parts[0]) as ToolNames : undefined;
	const Icon = (singleToolName && getTool(singleToolName)?.icon) || Wrench;
	const subject = singleToolName ?? `${parts.length} tools`;

	return (
		<div className="tool-group">
			<button
				type="button"
				className="tool-group-summary"
				aria-expanded={isExpanded}
				onClick={() => setIsExpanded(!isExpanded)}
			>
				{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
				<Icon size={14} />
				<span>{isRunning ? `Using ${subject}...` : `Used ${subject}`}</span>
				<span className="tool-group-status">
					{isRunning
						? <Loader2 size={14} className="animate-spin" />
						: hasError
						? <XCircle size={14} className="text-destructive" />
						: <Check size={14} />}
				</span>
			</button>
			{isExpanded && parts.map(part => (
				<ToolInvocation
					key={part.toolCallId}
					part={part}
					onApprove={onApprove}
					onDeny={onDeny}
					onAlwaysApprove={onAlwaysApprove}
					isApproving={approvingToolCallIds?.has(part.toolCallId)}
				/>
			))}
		</div>
	);
}
