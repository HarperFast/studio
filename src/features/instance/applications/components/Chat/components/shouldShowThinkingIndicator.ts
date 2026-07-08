import { type ChatStatus, isTextUIPart, isToolUIPart, type UIMessage } from 'ai';

/**
 * The indicator fills the dead air whenever a request is in flight but nothing visible is in
 * progress — before the first token, between a finished tool call and the next part, and while
 * invisible parts (reasoning, step markers) stream. Growing text and in-flight tool calls
 * provide their own feedback, so the indicator stays hidden for those.
 */
export function shouldShowThinkingIndicator(status: ChatStatus, lastMessage: UIMessage | undefined): boolean {
	if (status !== 'submitted' && status !== 'streaming') {
		return false;
	}
	if (lastMessage?.role !== 'assistant') {
		return true;
	}
	const lastPart = lastMessage.parts?.at(-1);
	if (!lastPart) {
		return true;
	}
	if (isTextUIPart(lastPart)) {
		return lastPart.state === 'streaming' ? lastPart.text.length === 0 : true;
	}
	if (isToolUIPart(lastPart)) {
		return lastPart.state === 'output-available' || lastPart.state === 'output-error';
	}
	return true;
}
