import { isTextUIPart, isToolUIPart, type UIMessage } from 'ai';
import { motion } from 'framer-motion';
import { Bot, User } from 'lucide-react';
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
				{m.parts.map((part, i) => {
					if (isTextUIPart(part)) {
						return <div key={i} className="text-block">{part.text}</div>;
					}

					if (isToolUIPart(part)) {
						return (
							<ToolInvocation
								key={i}
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
