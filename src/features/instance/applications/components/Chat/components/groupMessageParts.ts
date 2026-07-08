import { type DynamicToolUIPart, getToolName, isToolUIPart, type ToolUIPart, type UIMessage } from 'ai';
import { getTool } from '../tools/clientTools';

export type ChatToolPart = ToolUIPart | DynamicToolUIPart;
type MessagePart = UIMessage['parts'][number];

export type MessagePartGroup =
	| { kind: 'part'; part: MessagePart; index: number }
	| { kind: 'tool-group'; parts: ChatToolPart[]; index: number };

export function isAwaitingApproval(part: ChatToolPart): boolean {
	return part.state === 'input-available' && Boolean(getTool(getToolName(part))?.requiresApproval);
}

/**
 * Collapses runs of back-to-back tool calls into a single group. Tool calls that surface
 * approval buttons stay out of groups so the Approve/Deny UI is always visible.
 */
export function groupMessageParts(parts: readonly MessagePart[] | undefined): MessagePartGroup[] {
	const groups: MessagePartGroup[] = [];
	for (const [index, part] of (parts ?? []).entries()) {
		if (isToolUIPart(part) && !isAwaitingApproval(part)) {
			const previous = groups.at(-1);
			if (previous?.kind === 'tool-group') {
				previous.parts.push(part);
			} else {
				groups.push({ kind: 'tool-group', parts: [part], index });
			}
		} else {
			groups.push({ kind: 'part', part, index });
		}
	}
	return groups;
}
