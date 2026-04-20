import { Send } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { SubmitEvent } from 'react';

interface ChatInputProps {
	input: string;
	setInput: (value: string) => void;
	onSubmit: (e: SubmitEvent) => void;
	disabled: boolean;
	autoFocus?: boolean;
}

export function ChatInput({ input, setInput, onSubmit, disabled, autoFocus }: ChatInputProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (autoFocus && !disabled) {
			inputRef.current?.focus();
		}
	}, [autoFocus, disabled]);

	return (
		<form onSubmit={onSubmit} className="input-area">
			<input
				ref={inputRef}
				value={input}
				onChange={(e) => setInput(e.target.value)}
				placeholder="Type a message..."
				disabled={disabled}
			/>
			<button type="submit" disabled={disabled || !input.trim()}>
				<Send size={18} />
			</button>
		</form>
	);
}
