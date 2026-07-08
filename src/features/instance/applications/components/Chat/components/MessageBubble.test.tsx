/**
 * @vitest-environment jsdom
 */
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, render } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { MessageBubble } from './MessageBubble';

afterEach(() => cleanup());

describe('MessageBubble', () => {
	it('should render nothing when parts is undefined', async () => {
		const mockMessage = {
			id: '1',
			role: 'assistant',
			content: '',
			// parts is missing/undefined
		} as unknown as UIMessage;

		const { container } = render(
			<TestProvider>
				<MessageBubble message={mockMessage} />
			</TestProvider>,
		);

		await act(() => null);

		// Empty bubbles are hidden so the thinking indicator can stand alone while streaming starts.
		expect(container.querySelector('.message-bubble')).toBeNull();
	});

	it('should render message parts when they exist', async () => {
		const mockMessage = {
			id: '2',
			role: 'user',
			content: 'Hello',
			parts: [
				{ type: 'text', text: 'Hello' },
			],
		} as unknown as UIMessage;

		const { getByText } = render(
			<TestProvider>
				<MessageBubble message={mockMessage} />
			</TestProvider>,
		);

		await act(() => null);

		expect(getByText('Hello')).toBeTruthy();
	});
});
