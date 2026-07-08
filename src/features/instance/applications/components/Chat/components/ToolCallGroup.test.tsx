/**
 * @vitest-environment jsdom
 */
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { MessageBubble } from './MessageBubble';

afterEach(() => cleanup());

const completedToolPart = (toolName: string, toolCallId: string) => ({
	type: `tool-${toolName}`,
	toolCallId,
	state: 'output-available',
	input: { some: 'input' },
	output: { some: 'output' },
});

const assistantMessage = (parts: unknown[]) =>
	({
		id: 'a1',
		role: 'assistant',
		parts,
	}) as unknown as UIMessage;

describe('ToolCallGroup', () => {
	it('collapses back-to-back tool calls into a single summary line', async () => {
		const message = assistantMessage([
			completedToolPart('getComponents', 'call-1'),
			completedToolPart('getComponentFile', 'call-2'),
		]);

		const { getByText, queryByText, container } = render(
			<TestProvider>
				<MessageBubble message={message} />
			</TestProvider>,
		);
		await act(() => null);

		expect(getByText('Used 2 tools')).toBeTruthy();
		expect(queryByText('getComponents')).toBeNull();
		expect(queryByText('getComponentFile')).toBeNull();
		expect(container.querySelectorAll('.tool-invocation').length).toBe(0);
	});

	it('shows a single collapsed line for one tool call', async () => {
		const message = assistantMessage([completedToolPart('getComponents', 'call-1')]);

		const { getByText } = render(
			<TestProvider>
				<MessageBubble message={message} />
			</TestProvider>,
		);
		await act(() => null);

		expect(getByText('Used getComponents')).toBeTruthy();
	});

	it('shows an in-progress label while a grouped tool call is executing', async () => {
		const message = assistantMessage([
			{
				type: 'tool-getComponents',
				toolCallId: 'call-1',
				state: 'input-available',
				input: {},
			},
		]);

		const { getByText } = render(
			<TestProvider>
				<MessageBubble message={message} />
			</TestProvider>,
		);
		await act(() => null);

		expect(getByText('Using getComponents...')).toBeTruthy();
	});

	it('expands on click and collapses on a second click', async () => {
		const message = assistantMessage([
			completedToolPart('getComponents', 'call-1'),
			completedToolPart('getComponentFile', 'call-2'),
		]);

		const { getByRole, getByText, queryByText, container } = render(
			<TestProvider>
				<MessageBubble message={message} />
			</TestProvider>,
		);
		await act(() => null);

		const summary = getByRole('button', { name: /Used 2 tools/ });
		fireEvent.click(summary);

		expect(getByText('getComponents')).toBeTruthy();
		expect(getByText('getComponentFile')).toBeTruthy();
		expect(container.querySelectorAll('.tool-invocation').length).toBe(2);

		fireEvent.click(summary);

		expect(queryByText('getComponents')).toBeNull();
		expect(container.querySelectorAll('.tool-invocation').length).toBe(0);
	});

	it('keeps tool calls awaiting approval expanded and out of groups', async () => {
		const message = assistantMessage([
			completedToolPart('getComponents', 'call-1'),
			{
				// createApp has requiresApproval: true and no output yet, so it is awaiting approval.
				type: 'tool-createApp',
				toolCallId: 'call-2',
				state: 'input-available',
				input: { name: 'my-app' },
			},
		]);

		const { getByText, getByRole } = render(
			<TestProvider>
				<MessageBubble message={message} />
			</TestProvider>,
		);
		await act(() => null);

		// The non-approval tool is still collapsed...
		expect(getByText('Used getComponents')).toBeTruthy();
		// ...while the approval prompt renders fully expanded.
		expect(getByText('createApp')).toBeTruthy();
		expect(getByText('Awaiting Approval...')).toBeTruthy();
		expect(getByRole('button', { name: 'Approve' })).toBeTruthy();
	});

	it('does not group tool calls separated by a text part', async () => {
		const message = assistantMessage([
			completedToolPart('getComponents', 'call-1'),
			{ type: 'text', text: 'Here is what I found.' },
			completedToolPart('getComponentFile', 'call-2'),
		]);

		const { getByText } = render(
			<TestProvider>
				<MessageBubble message={message} />
			</TestProvider>,
		);
		await act(() => null);

		expect(getByText('Used getComponents')).toBeTruthy();
		expect(getByText('Here is what I found.')).toBeTruthy();
		expect(getByText('Used getComponentFile')).toBeTruthy();
	});
});
