import { Bot } from 'lucide-react';
import { motion } from 'motion/react';

export function ThinkingIndicator() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: 0.2 }}
			className="message-bubble assistant"
		>
			<div className="avatar">
				<Bot size={18} />
			</div>
			<div className="content thinking-indicator" role="status" aria-label="Harper Agent is thinking">
				<span className="thinking-dot" />
				<span className="thinking-dot" />
				<span className="thinking-dot" />
			</div>
		</motion.div>
	);
}
