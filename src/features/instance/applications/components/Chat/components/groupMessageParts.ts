import { type DynamicToolUIPart, getToolName, isTextUIPart, isToolUIPart, type ToolUIPart, type UIMessage } from 'ai';
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
 * approval buttons stay out of groups so the Approve/Deny UI is always visible, and only
 * visible content (non-empty text, approval cards) breaks a run — invisible parts like
 * step markers and reasoning render nothing, so they must not split the group.
 */
export function groupMessageParts(parts: readonly MessagePart[] | undefined): MessagePartGroup[] {
	const groups: MessagePartGroup[] = [];
	for (const [index, part] of (parts ?? []).entries()) {
		if (isToolUIPart(part)) {
			if (isAwaitingApproval(part)) {
				groups.push({ kind: 'part', part, index });
				continue;
			}
			const previous = groups.at(-1);
			if (previous?.kind === 'tool-group') {
				previous.parts.push(part);
			} else {
				groups.push({ kind: 'tool-group', parts: [part], index });
			}
			continue;
		}

		if (isTextUIPart(part) && part.text.length > 0) {
			groups.push({ kind: 'part', part, index });
		}
	}
	return groups;
}
