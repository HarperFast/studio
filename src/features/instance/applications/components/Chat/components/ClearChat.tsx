import { RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

export function ClearChat({ setMessages }: { setMessages: (messages: []) => void }) {
	const [isClearing, setIsClearing] = useState(false);

	const handleClearChat = useCallback(async () => {
		if (isClearing) {
			return;
		}

		setIsClearing(true);
		try {
			const response = await fetch('/Chat/Messages/', {
				method: 'DELETE',
			});

			if (response.ok) {
				setMessages([]);
			} else {
				console.error('Failed to clear chat:', response.statusText);
			}
		} catch (error) {
			console.error('Failed to clear chat:', error);
		} finally {
			setIsClearing(false);
		}
	}, [isClearing, setMessages]);

	return (
		<button
			type="button"
			className="clear-chat-button gap-1"
			onClick={handleClearChat}
			disabled={isClearing}
			title="Clear chat"
		>
			{isClearing ? <RefreshCw className="animate-spin" size={18} /> : <Trash2 size={18} />}
			Clear
		</button>
	);
}
