import { isTextUIPart, isToolUIPart, type UIMessage } from 'ai';
import { Bot, User } from 'lucide-react';
import { motion } from 'motion/react';
import { groupMessageParts } from './groupMessageParts';
import { ToolCallGroup } from './ToolCallGroup';
import { ToolInvocation } from './ToolInvocation';

interface MessageBubbleProps {
	message: UIMessage;
	onApprove?: (toolCallId: string) => void;
	onDeny?: (toolCallId: string) => void;
	onAlwaysApprove?: (toolCallId: string) => void;
	approvingToolCallIds?: Set<string>;
}

export function MessageBubble(
	{ message: m, onApprove, onDeny, onAlwaysApprove, approvingToolCallIds }: MessageBubbleProps,
) {
	return (
		<motion.div
			key={m.id}
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			className={`message-bubble ${m.role === 'user' ? 'user' : 'assistant'}`}
		>
			<div className="avatar">
				{m.role === 'user' ? <User size={18} /> : <Bot size={18} />}
			</div>
			<div className="content">
				{groupMessageParts(m.parts).map(item => {
					if (item.kind === 'tool-group') {
						return (
							<ToolCallGroup
								key={item.parts[0].toolCallId}
								parts={item.parts}
								onApprove={onApprove}
								onDeny={onDeny}
								onAlwaysApprove={onAlwaysApprove}
								approvingToolCallIds={approvingToolCallIds}
							/>
						);
					}

					const { part, index } = item;
					if (isTextUIPart(part)) {
						return <div key={index} className="text-block">{part.text}</div>;
					}

					if (isToolUIPart(part)) {
						return (
							<ToolInvocation
								key={index}
								part={part}
								onApprove={onApprove}
								onDeny={onDeny}
								onAlwaysApprove={onAlwaysApprove}
								isApproving={approvingToolCallIds?.has(part.toolCallId)}
							/>
						);
					}
					return null;
				})}
			</div>
		</motion.div>
	);
}
